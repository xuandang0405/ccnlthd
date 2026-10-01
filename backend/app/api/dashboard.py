from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.models.entities import (
    Chatbot,
    Conversation,
    Document,
    Lead,
    LeadStatus,
    Message,
    Plan,
    Subscription,
    UsageLog,
)
from app.schemas.dashboard import DashboardSummary
from app.services.credits import ensure_credit_account, ensure_organization_limits

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    org_id = context.organization.id
    subscription = await db.scalar(
        select(Subscription)
        .where(
            Subscription.organization_id == org_id,
            Subscription.is_active.is_(True),
            or_(Subscription.ends_at.is_(None), Subscription.ends_at > datetime.now(UTC)),
        )
        .order_by(Subscription.starts_at.desc())
        .limit(1)
    )
    plan = await db.get(Plan, subscription.plan_id) if subscription else None
    usage = await db.scalar(
        select(func.coalesce(func.sum(UsageLog.quantity), 0)).where(
            UsageLog.organization_id == org_id,
            UsageLog.event_type == "CHAT_MESSAGE",
            UsageLog.usage_date == date.today(),
        )
    )
    credits = await ensure_credit_account(db, org_id)
    limits = await ensure_organization_limits(db, org_id)
    return DashboardSummary(
        chatbot_count=await db.scalar(
            select(func.count()).select_from(Chatbot).where(Chatbot.organization_id == org_id)
        ),
        conversation_count=await db.scalar(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.organization_id == org_id)
        ),
        message_count=await db.scalar(
            select(func.count()).select_from(Message).where(Message.organization_id == org_id)
        ),
        lead_count=await db.scalar(
            select(func.count()).select_from(Lead).where(Lead.organization_id == org_id)
        ),
        new_lead_count=await db.scalar(
            select(func.count())
            .select_from(Lead)
            .where(Lead.organization_id == org_id, Lead.status == LeadStatus.NEW)
        ),
        document_count=await db.scalar(
            select(func.count()).select_from(Document).where(Document.organization_id == org_id)
        ),
        current_plan=plan.display_name if plan else "Miễn phí",
        daily_limit=plan.daily_chat_limit if plan else 20,
        daily_used=int(usage),
        free_credits_remaining=credits.free_remaining,
        purchased_credits_remaining=credits.purchased_remaining,
        chatbot_slots=limits.chatbot_slots,
    )
