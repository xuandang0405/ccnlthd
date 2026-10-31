from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.models.entities import Chatbot, Conversation, Lead, LeadStatus, Message, MessageRole
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
    db: AsyncSession = Depends(get_db, scope="function"),
):
    conditions = [Conversation.organization_id == context.organization.id]
    if chatbot_id:
        conditions.append(Conversation.chatbot_id == str(chatbot_id))
    if search:
        matching_ids = select(Message.conversation_id).where(
            Message.organization_id == context.organization.id,
            Message.content.icontains(search.strip(), autoescape=True),
        )
        conditions.append(Conversation.id.in_(matching_ids))
    if from_at:
        conditions.append(Conversation.created_at >= from_at)
    if to_at:
        conditions.append(Conversation.created_at <= to_at)
    total = await db.scalar(select(func.count()).select_from(Conversation).where(*conditions))
    conversations = (
        await db.scalars(
            select(Conversation)
            .where(*conditions)
            .order_by(Conversation.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    bots = (
        await db.scalars(
            select(Chatbot).where(Chatbot.id.in_([item.chatbot_id for item in conversations]))
        )
    ).all()
    chatbot_names = {bot.id: bot.name for bot in bots}
    # ROW_NUMBER lấy câu hỏi đầu tiên, không kéo toàn bộ lịch sử hội thoại lên Python.
    ranked_questions = (
        select(
            Message.conversation_id,
            Message.content,
            func.row_number()
            .over(partition_by=Message.conversation_id, order_by=(Message.created_at, Message.id))
            .label("position"),
        )
        .where(
            Message.conversation_id.in_([item.id for item in conversations]),
            Message.organization_id == context.organization.id,
            Message.role == MessageRole.USER,
        )
        .subquery()
    )
    rows = await db.execute(
        select(ranked_questions.c.conversation_id, ranked_questions.c.content).where(
            ranked_questions.c.position == 1
        )
    )
    questions = dict(rows.all())
    return ConversationPage(
        items=[
            {
                **item.as_dict(),
                "chatbot_name": chatbot_names.get(item.chatbot_id, "Chatbot đã xóa"),
                "first_question": questions.get(item.id),
            }
            for item in conversations
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == str(conversation_id),
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
            .order_by(Message.created_at, Message.id)
        )
    ).all()
    chatbot = await db.get(Chatbot, conversation.chatbot_id)
    return ConversationDetail.model_validate(
        {
            **conversation.as_dict(),
            "chatbot_name": chatbot.name if chatbot else "Chatbot đã xóa",
            "first_question": next(
                (message.content for message in messages if message.role == MessageRole.USER), None
            ),
            "messages": [message.as_dict() for message in messages],
        }
    )


@router.get("/leads", response_model=LeadPage)
async def list_leads(
    search: str | None = Query(default=None, max_length=100),
    lead_status: LeadStatus | None = Query(default=None, alias="status"),
    chatbot_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    conditions = [Lead.organization_id == context.organization.id]
    if lead_status:
        conditions.append(Lead.status == lead_status)
    if chatbot_id:
        conditions.append(Lead.chatbot_id == str(chatbot_id))
    if search:
        conditions.append(
            or_(
                *[
                    column.icontains(search.strip(), autoescape=True)
                    for column in (Lead.customer_name, Lead.phone, Lead.email, Lead.intent_summary)
                ]
            )
        )
    total = await db.scalar(select(func.count()).select_from(Lead).where(*conditions))
    leads = (
        await db.scalars(
            select(Lead)
            .where(*conditions)
            .order_by(Lead.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return LeadPage(items=leads, total=total, page=page, page_size=page_size)


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    payload: LeadStatusUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    lead = await db.scalar(
        select(Lead)
        .where(Lead.id == str(lead_id), Lead.organization_id == context.organization.id)
        .with_for_update()
    )
    if lead is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lead")
    lead.status = payload.status
    await db.flush()
    return lead
