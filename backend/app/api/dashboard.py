from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import get_mongo_db
from app.models.entities import LeadStatus
from app.schemas.dashboard import DashboardSummary
from app.services.credits import ensure_credit_account, ensure_organization_limits

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    org_id = str(context.organization.id)
    now = datetime.now(UTC)
    subscription = await db.subscriptions.find_one(
        {
            "organization_id": org_id,
            "is_active": True,
            "$or": [{"ends_at": None}, {"ends_at": {"$gt": now}}],
        },
        sort=[("starts_at", -1)],
    )
    plan = await db.plans.find_one({"_id": subscription["plan_id"]}) if subscription else None
    usage_cursor = await db.usage_logs.aggregate(
        [
            {
                "$match": {
                    "organization_id": org_id,
                    "event_type": "CHAT_MESSAGE",
                    "usage_date": date.today().isoformat(),
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$quantity"}}},
        ]
    )
    usage = await usage_cursor.to_list(1)
    credits = await ensure_credit_account(db, org_id)
    limits = await ensure_organization_limits(db, org_id)
    return DashboardSummary(
        chatbot_count=await db.chatbots.count_documents({"organization_id": org_id}),
        conversation_count=await db.conversations.count_documents({"organization_id": org_id}),
        message_count=await db.messages.count_documents({"organization_id": org_id}),
        lead_count=await db.leads.count_documents({"organization_id": org_id}),
        new_lead_count=await db.leads.count_documents(
            {"organization_id": org_id, "status": LeadStatus.NEW.value}
        ),
        document_count=await db.documents.count_documents({"organization_id": org_id}),
        current_plan=plan["display_name"] if plan else "Miễn phí",
        daily_limit=plan["daily_chat_limit"] if plan else 20,
        daily_used=int(usage[0]["total"] if usage else 0),
        free_credits_remaining=int(credits.get("free_remaining", 0)),
        purchased_credits_remaining=int(credits.get("purchased_remaining", 0)),
        chatbot_slots=int(limits.get("chatbot_slots", 1)),
    )
