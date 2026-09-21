from datetime import UTC, datetime

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

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


async def count_for(db: AsyncSession, model, organization_id):
    return int(
        await db.scalar(
            select(func.count()).select_from(model).where(model.organization_id == organization_id)
        )
        or 0
    )


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    context: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)
):
    org_id = context.organization.id
    plan_row = (
        await db.execute(
            select(Plan.display_name, Plan.daily_chat_limit)
            .join(Subscription, Subscription.plan_id == Plan.id)
            .where(
                Subscription.organization_id == org_id,
                Subscription.is_active.is_(True),
                or_(Subscription.ends_at.is_(None), Subscription.ends_at > datetime.now(UTC)),
            )
            .order_by(Subscription.starts_at.desc())
            .limit(1)
        )
    ).one_or_none()
    used = await db.scalar(
        select(func.coalesce(func.sum(UsageLog.quantity), 0)).where(
            UsageLog.organization_id == org_id,
            UsageLog.event_type == "CHAT_MESSAGE",
            UsageLog.usage_date == func.current_date(),
        )
    )
    new_leads = await db.scalar(
        select(func.count())
        .select_from(Lead)
        .where(Lead.organization_id == org_id, Lead.status == LeadStatus.NEW)
    )
    return DashboardSummary(
        chatbot_count=await count_for(db, Chatbot, org_id),
        conversation_count=await count_for(db, Conversation, org_id),
        message_count=await count_for(db, Message, org_id),
        lead_count=await count_for(db, Lead, org_id),
        new_lead_count=int(new_leads or 0),
        document_count=await count_for(db, Document, org_id),
        current_plan=plan_row[0] if plan_row else "Miễn phí",
        daily_limit=plan_row[1] if plan_row else 20,
        daily_used=int(used or 0),
    )
