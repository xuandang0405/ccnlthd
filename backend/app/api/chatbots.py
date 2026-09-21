from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.models.entities import Chatbot, ChatbotDocument, Document, DocumentStatus
from app.schemas.chatbot import ChatbotCreate, ChatbotResponse, ChatbotUpdate

router = APIRouter(prefix="/chatbots", tags=["Chatbots"])


@router.get("", response_model=list[ChatbotResponse])
async def list_chatbots(
    context: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)
):
    result = await db.scalars(
        select(Chatbot)
        .where(Chatbot.organization_id == context.organization.id)
        .order_by(Chatbot.created_at.desc())
    )
    return list(result)


@router.post("", response_model=ChatbotResponse, status_code=201)
async def create_chatbot(
    payload: ChatbotCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    chatbot = Chatbot(organization_id=context.organization.id, **payload.model_dump())
    db.add(chatbot)
    await db.flush()
    return chatbot


async def owned_chatbot(db: AsyncSession, chatbot_id: UUID, organization_id: UUID) -> Chatbot:
    chatbot = await db.scalar(
        select(Chatbot).where(Chatbot.id == chatbot_id, Chatbot.organization_id == organization_id)
    )
    if chatbot is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    return chatbot


@router.get("/{chatbot_id}", response_model=ChatbotResponse)
async def get_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    return await owned_chatbot(db, chatbot_id, context.organization.id)


@router.patch("/{chatbot_id}", response_model=ChatbotResponse)
async def update_chatbot(
    chatbot_id: UUID,
    payload: ChatbotUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(chatbot, key, value)
    await db.flush()
    return chatbot


@router.delete("/{chatbot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    await db.delete(chatbot)


@router.put("/{chatbot_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_document(
    chatbot_id: UUID,
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    document = await db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == context.organization.id,
            Document.status == DocumentStatus.DONE,
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Tài liệu chưa sẵn sàng hoặc không tồn tại")
    existing = await db.scalar(
        select(ChatbotDocument.id).where(
            ChatbotDocument.chatbot_id == chatbot.id,
            ChatbotDocument.document_id == document.id,
        )
    )
    if existing is None:
        db.add(
            ChatbotDocument(
                organization_id=context.organization.id,
                chatbot_id=chatbot.id,
                document_id=document.id,
            )
        )
