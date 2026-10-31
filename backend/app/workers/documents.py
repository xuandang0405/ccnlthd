import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

from anyio import to_thread
from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionFactory, engine
from app.core.records import add_records, make_record, update_record
from app.integrations.gemini import GeminiServiceError
from app.models.entities import (
    ChatbotDocument,
    Document,
    DocumentChunk,
    DocumentChunkToken,
    DocumentStatus,
    SystemSetting,
)
from app.services.document_links import (
    backfill_document_links,
    link_document_to_chatbots,
    revoke_auto_approvals,
)
from app.services.document_review import review_catalog_with_ai
from app.services.documents import chunks, normalize_search_text, parse_document, search_tokens

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("document-worker")
settings = get_settings()


async def claim_document(db: AsyncSession):
    now = datetime.now(UTC)
    document = await update_record(
        db,
        Document,
        (
            or_(
                (Document.status == DocumentStatus.UPLOADED.value),
                and_(
                    Document.status == DocumentStatus.PROCESSING.value,
                    Document.updated_at < now - timedelta(minutes=15),
                ),
            )
        ),
        values={
            "status": DocumentStatus.PROCESSING.value,
            "processing_error": None,
            "updated_at": now,
        },
        order_by=(Document.created_at.asc(),),
    )
    return document


async def process(db: AsyncSession, document: Document) -> None:
    document_id = document.id
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
        moderation = await db.scalar(
            select(SystemSetting)
            .where(SystemSetting.id == "document_moderation")
            .limit(1)
            .execution_options(populate_existing=True)
        )
        auto_review = bool(moderation.get("auto_review", False)) if moderation else False
        review = None
        approval_note = "Chờ Admin duyệt tài liệu"
        if auto_review:
            try:
                review = await review_catalog_with_ai(text)
                approval_note = review.summary
            except GeminiServiceError as exc:
                logger.warning("AI review failed document_id=%s: %s", document.id, exc)
                approval_note = "AI chưa kiểm tra được; chờ Admin duyệt tay"
        if review and review.passed:
            current_setting = await db.scalar(
                select(SystemSetting)
                .where(SystemSetting.id == "document_moderation")
                .limit(1)
                .execution_options(populate_existing=True)
            )
            auto_review = bool(current_setting and current_setting.get("auto_review"))
            if not auto_review:
                approval_note = "Đã tắt duyệt AI; chờ Admin duyệt tay"
        approval_status = "APPROVED" if auto_review and review and review.passed else "PENDING"
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        if pieces:
            await add_records(
                db,
                DocumentChunk,
                [
                    make_record(
                        organization_id=document.organization_id,
                        document_id=document.id,
                        chunk_index=index,
                        content=content,
                        search_text=normalize_search_text(content),
                        search_tokens=search_tokens(content),
                    )
                    for index, content in enumerate(pieces)
                ],
            )
        indexed_chunks = (
            await db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id))
        ).all()
        token_rows = []
        for chunk in indexed_chunks:
            for token in set(chunk.search_tokens):
                if len(token) <= 100:
                    token_rows.append(DocumentChunkToken(chunk_id=chunk.id, token=token))
                if len(token_rows) >= 1000:
                    db.add_all(token_rows)
                    await db.flush()
                    token_rows = []
        db.add_all(token_rows)
        await db.flush()
        await db.execute(
            update(Document)
            .where(Document.id == document.id)
            .values(
                **{
                    **{
                        "extracted_text": text[:200_000],
                        "extracted_char_count": len(text),
                        "chunk_count": len(pieces),
                        "status": DocumentStatus.DONE.value,
                        "processing_error": None,
                        "approval_status": approval_status,
                        "approval_note": approval_note,
                        "ai_review": review.as_dict() if review else None,
                        "approved_at": datetime.now(UTC) if approval_status == "APPROVED" else None,
                        "approved_by_user_id": None,
                        "updated_at": datetime.now(UTC),
                    }
                }
            )
        )
        linked = (
            await link_document_to_chatbots(
                db,
                organization_id=document.organization_id,
                document_id=document.id,
            )
            if approval_status == "APPROVED"
            else 0
        )
        if approval_status != "APPROVED":
            await db.execute(
                delete(ChatbotDocument).where(ChatbotDocument.document_id == document.id)
            )
        logger.info(
            "Processed document_id=%s chunks=%s chatbot_links_added=%s",
            document.id,
            len(pieces),
            linked,
        )
    except Exception as exc:
        logger.exception("Document processing failed document_id=%s", document_id)
        await db.rollback()
        await db.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(
                **{
                    **{
                        "status": DocumentStatus.FAILED.value,
                        "processing_error": f"{type(exc).__name__}: {str(exc)[:300]}",
                        "updated_at": datetime.now(UTC),
                    }
                }
            )
        )


async def run() -> None:
    logger.info("Document worker started")
    try:
        async with SessionFactory.begin() as db:
            moderation = await db.get(SystemSetting, "document_moderation")
            if not moderation or not moderation.auto_review:
                revoked = await revoke_auto_approvals(db)
                logger.info("Auto-approved documents returned to review queue count=%s", revoked)
            linked = await backfill_document_links(db)
            logger.info("Document link backfill completed links_added=%s", linked)
        while True:
            async with SessionFactory() as db:
                document = await claim_document(db)
                await db.commit()
                if document is not None:
                    await process(db, document)
                    await db.commit()
            if document is None:
                await asyncio.sleep(2)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Document worker stopped")
