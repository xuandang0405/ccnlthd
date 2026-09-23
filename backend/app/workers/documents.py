import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from anyio import to_thread

from app.core.config import get_settings
from app.core.mongodb import close_mongo_client, get_mongo_database, new_document, record
from app.models.entities import DocumentStatus
from app.services.document_links import backfill_document_links, link_document_to_chatbots
from app.services.documents import chunks, parse_document

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("document-worker")
settings = get_settings()


async def claim_document(db: Any):
    now = datetime.now(UTC)
    document = await db.documents.find_one_and_update(
        {
            "$or": [
                {"status": DocumentStatus.UPLOADED.value},
                {
                    "status": DocumentStatus.PROCESSING.value,
                    "updated_at": {"$lt": now - timedelta(minutes=15)},
                },
            ]
        },
        {
            "$set": {
                "status": DocumentStatus.PROCESSING.value,
                "processing_error": None,
                "updated_at": now,
            }
        },
        sort=[("created_at", 1)],
        return_document=True,
    )
    return record(document)


async def process(db: Any, document: Any) -> None:
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
        await db.document_chunks.delete_many({"document_id": document.id})
        if pieces:
            await db.document_chunks.insert_many(
                [
                    new_document(
                        organization_id=document.organization_id,
                        document_id=document.id,
                        chunk_index=index,
                        content=content,
                    )
                    for index, content in enumerate(pieces)
                ]
            )
        await db.documents.update_one(
            {"_id": document.id},
            {
                "$set": {
                    "extracted_text": text,
                    "status": DocumentStatus.DONE.value,
                    "processing_error": None,
                    "updated_at": datetime.now(UTC),
                }
            },
        )
        linked = await link_document_to_chatbots(
            db,
            organization_id=document.organization_id,
            document_id=document.id,
        )
        logger.info(
            "Processed document_id=%s chunks=%s chatbot_links_added=%s",
            document.id,
            len(pieces),
            linked,
        )
    except Exception as exc:
        logger.exception("Document processing failed document_id=%s", document.id)
        await db.documents.update_one(
            {"_id": document.id},
            {
                "$set": {
                    "status": DocumentStatus.FAILED.value,
                    "processing_error": f"{type(exc).__name__}: {str(exc)[:300]}",
                    "updated_at": datetime.now(UTC),
                }
            },
        )


async def run() -> None:
    logger.info("Document worker started")
    db = get_mongo_database()
    try:
        linked = await backfill_document_links(db)
        logger.info("Document link backfill completed links_added=%s", linked)
        while True:
            document = await claim_document(db)
            if document is None:
                await asyncio.sleep(2)
                continue
            await process(db, document)
    finally:
        await close_mongo_client()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Document worker stopped")
