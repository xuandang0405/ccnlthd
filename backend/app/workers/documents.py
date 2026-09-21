import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

from anyio import to_thread
from sqlalchemy import delete, or_, select

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.models.entities import Document, DocumentChunk, DocumentStatus
from app.services.documents import chunks, parse_document

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("document-worker")
settings = get_settings()


async def claim_document() -> Document | None:
    stale_before = datetime.now(UTC) - timedelta(minutes=15)
    async with SessionFactory.begin() as db:
        document = await db.scalar(
            select(Document)
            .where(
                or_(
                    Document.status == DocumentStatus.UPLOADED,
                    (Document.status == DocumentStatus.PROCESSING)
                    & (Document.updated_at < stale_before),
                )
            )
            .order_by(Document.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if document:
            document.status = DocumentStatus.PROCESSING
            document.processing_error = None
            await db.flush()
            db.expunge(document)
        return document


async def process(document: Document) -> None:
    try:
        path = settings.upload_dir / document.storage_key
        extension = Path(document.original_name).suffix.lower()
        text = await to_thread.run_sync(
            parse_document,
            path,
            extension,
            settings.document_max_pages,
            settings.document_max_cells,
        )
        pieces = chunks(text)
        async with SessionFactory.begin() as db:
            fresh = await db.get(Document, document.id, with_for_update=True)
            if fresh is None:
                return
            await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == fresh.id))
            db.add_all(
                [
                    DocumentChunk(
                        organization_id=fresh.organization_id,
                        document_id=fresh.id,
                        chunk_index=index,
                        content=content,
                    )
                    for index, content in enumerate(pieces)
                ]
            )
            fresh.extracted_text = text
            fresh.status = DocumentStatus.DONE
            fresh.processing_error = None
        logger.info("Processed document_id=%s chunks=%s", document.id, len(pieces))
    except Exception as exc:
        logger.exception("Document processing failed document_id=%s", document.id)
        async with SessionFactory.begin() as db:
            fresh = await db.get(Document, document.id, with_for_update=True)
            if fresh:
                fresh.status = DocumentStatus.FAILED
                fresh.processing_error = f"{type(exc).__name__}: {str(exc)[:300]}"


async def run() -> None:
    logger.info("Document worker started")
    while True:
        document = await claim_document()
        if document is None:
            await asyncio.sleep(2)
            continue
        await process(document)


if __name__ == "__main__":
    asyncio.run(run())
