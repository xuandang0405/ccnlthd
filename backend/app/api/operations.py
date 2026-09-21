from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.models.entities import Conversation, Lead, LeadStatus, Message
from app.schemas.operations import (
    ConversationDetail,
    ConversationPage,
    LeadPage,
    LeadResponse,
    LeadStatusUpdate,
)

router = APIRouter(tags=["Operations"])


@router.get("/conversations", response_model=ConversationPage)
async def list_conversations(
    search: str | None = Query(default=None, max_length=100),
    chatbot_id: UUID | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    filters = [Conversation.organization_id == context.organization.id]
    if chatbot_id:
        filters.append(Conversation.chatbot_id == chatbot_id)
    if search:
        filters.append(
            Conversation.id.in_(
                select(Message.conversation_id).where(
                    Message.organization_id == context.organization.id,
                    Message.content.ilike(f"%{search.strip()}%"),
                )
            )
        )
    if from_at:
        filters.append(Conversation.created_at >= from_at)
    if to_at:
        filters.append(Conversation.created_at <= to_at)
    total = int(
        await db.scalar(select(func.count()).select_from(Conversation).where(*filters)) or 0
    )
    items = (
        await db.scalars(
            select(Conversation)
            .where(*filters)
            .order_by(Conversation.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return ConversationPage(items=list(items), total=total, page=page, page_size=page_size)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.organization_id == context.organization.id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    messages = (
        await db.scalars(
            select(Message)
            .where(
                Message.conversation_id == conversation.id,
                Message.organization_id == context.organization.id,
            )
            .order_by(Message.created_at)
        )
    ).all()
    return ConversationDetail.model_validate(
        {**conversation.__dict__, "messages": list(messages)}
    )


@router.get("/leads", response_model=LeadPage)
async def list_leads(
    search: str | None = Query(default=None, max_length=100),
    lead_status: LeadStatus | None = Query(default=None, alias="status"),
    chatbot_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    filters = [Lead.organization_id == context.organization.id]
    if lead_status:
        filters.append(Lead.status == lead_status)
    if chatbot_id:
        filters.append(Lead.chatbot_id == chatbot_id)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                Lead.customer_name.ilike(term),
                Lead.phone.ilike(term),
                Lead.email.ilike(term),
                Lead.intent_summary.ilike(term),
            )
        )
    total = int(await db.scalar(select(func.count()).select_from(Lead).where(*filters)) or 0)
    items = (
        await db.scalars(
            select(Lead)
            .where(*filters)
            .order_by(Lead.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return LeadPage(items=list(items), total=total, page=page, page_size=page_size)


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    payload: LeadStatusUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    lead = await db.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == context.organization.id)
    )
    if lead is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lead")
    lead.status = payload.status
    return lead
