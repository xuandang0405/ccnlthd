import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_super_admin
from app.core.mongodb import get_mongo_db, new_document, record
from app.models.entities import DocumentStatus, PaymentStatus
from app.schemas.admin import AdminOrganization, AdminSummary, OrganizationStateUpdate

router = APIRouter(prefix="/admin", tags=["Super Admin"])


@router.get("/summary", response_model=AdminSummary)
async def summary(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    return AdminSummary(
        organizations=await db.organizations.count_documents({}),
        users=await db.users.count_documents({}),
        chatbots=await db.chatbots.count_documents({}),
        conversations=await db.conversations.count_documents({}),
        leads=await db.leads.count_documents({}),
        documents_processing=await db.documents.count_documents(
            {"status": {"$in": [DocumentStatus.UPLOADED.value, DocumentStatus.PROCESSING.value]}}
        ),
        payments_pending=await db.payment_orders.count_documents(
            {"status": PaymentStatus.PENDING.value}
        ),
    )


@router.get("/organizations", response_model=list[AdminOrganization])
async def organizations(
    limit: int = Query(default=100, ge=1, le=500),
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    documents = await db.organizations.find({}).sort("created_at", -1).limit(limit).to_list(None)
    return [record(document) for document in documents]


@router.patch("/organizations/{organization_id}", response_model=AdminOrganization)
async def set_organization_state(
    organization_id: UUID,
    payload: OrganizationStateUpdate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(organization_id)}
    result = await db.organizations.update_one(
        query, {"$set": {"is_active": payload.is_active, "updated_at": datetime.now(UTC)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy doanh nghiệp")
    await db.audit_logs.insert_one(
        new_document(
            organization_id=str(organization_id),
            actor_user_id=str(admin.id),
            action="ORGANIZATION_STATE_CHANGED",
            resource_type="organization",
            resource_id=str(organization_id),
            metadata_redacted=json.dumps({"is_active": payload.is_active}),
        )
    )
    return record(await db.organizations.find_one(query))
