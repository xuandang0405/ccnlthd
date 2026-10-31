from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.records import add_record, make_record
from app.models.entities import Chatbot, ChatbotDocument, Document, DocumentStatus


async def add_link(
    db: AsyncSession, organization_id: str, chatbot_id: str, document_id: str
) -> int:
    existing = await db.scalar(
        select(ChatbotDocument.id).where(
            ChatbotDocument.chatbot_id == chatbot_id, ChatbotDocument.document_id == document_id
        )
    )
    if existing:
        return 0
    try:
        await add_record(
            db,
            ChatbotDocument,
            make_record(
                organization_id=organization_id, chatbot_id=chatbot_id, document_id=document_id
            ),
        )
    except IntegrityError:
        return 0
    return 1


async def link_document_to_chatbots(
    db: AsyncSession, *, organization_id: str, document_id: str
) -> int:
    chatbot_ids = (
        await db.scalars(select(Chatbot.id).where(Chatbot.organization_id == organization_id))
    ).all()
    linked = 0
    for chatbot_id in chatbot_ids:
        linked += await add_link(db, organization_id, chatbot_id, document_id)
    return linked


async def link_chatbot_to_documents(
    db: AsyncSession, *, organization_id: str, chatbot_id: str
) -> int:
    document_ids = (
        await db.scalars(
            select(Document.id).where(
                Document.organization_id == organization_id,
                Document.status == DocumentStatus.DONE,
                Document.approval_status == "APPROVED",
            )
        )
    ).all()
    linked = 0
    for document_id in document_ids:
        linked += await add_link(db, organization_id, chatbot_id, document_id)
    return linked


async def backfill_document_links(db: AsyncSession) -> int:
    documents = (
        await db.scalars(
            select(Document).where(
                Document.status == DocumentStatus.DONE, Document.approval_status == "APPROVED"
            )
        )
    ).all()
    linked = 0
    for document in documents:
        linked += await link_document_to_chatbots(
            db, organization_id=document.organization_id, document_id=document.id
        )
    return linked


async def revoke_auto_approvals(db: AsyncSession) -> int:
    ids = (
        await db.scalars(
            select(Document.id).where(
                Document.approval_status == "APPROVED", Document.approved_by_user_id.is_(None)
            )
        )
    ).all()
    if ids:
        await db.execute(
            update(Document)
            .where(Document.id.in_(ids))
            .values(
                approval_status="PENDING",
                approval_note="Đã tắt duyệt AI; chờ Admin duyệt tay",
                approved_at=None,
                updated_at=datetime.now(UTC),
            )
        )
        await db.execute(delete(ChatbotDocument).where(ChatbotDocument.document_id.in_(ids)))
    return len(ids)
