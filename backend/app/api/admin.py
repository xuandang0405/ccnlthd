from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_super_admin
from app.core.database import get_db
from app.models.entities import (
    AuditLog,
    Chatbot,
    Conversation,
    Document,
    DocumentStatus,
    Lead,
    Organization,
    PaymentOrder,
    PaymentStatus,
    User,
)
from app.schemas.admin import AdminOrganization, AdminSummary, OrganizationStateUpdate

router = APIRouter(prefix="/admin", tags=["Super Admin"])


async def model_count(db: AsyncSession, model, *filters) -> int:
    return int(await db.scalar(select(func.count()).select_from(model).where(*filters)) or 0)


@router.get("/summary", response_model=AdminSummary)
async def summary(
    _: User = Depends(get_super_admin), db: AsyncSession = Depends(get_db)
):
    return AdminSummary(
        organizations=await model_count(db, Organization),
        users=await model_count(db, User),
        chatbots=await model_count(db, Chatbot),
        conversations=await model_count(db, Conversation),
        leads=await model_count(db, Lead),
        documents_processing=await model_count(
            db, Document, Document.status.in_([DocumentStatus.UPLOADED, DocumentStatus.PROCESSING])
        ),
        payments_pending=await model_count(
            db, PaymentOrder, PaymentOrder.status == PaymentStatus.PENDING
        ),
    )


@router.get("/organizations", response_model=list[AdminOrganization])
async def organizations(
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
):
    return list(
        (
            await db.scalars(
                select(Organization).order_by(Organization.created_at.desc()).limit(limit)
            )
        ).all()
    )


@router.patch("/organizations/{organization_id}", response_model=AdminOrganization)
async def set_organization_state(
    organization_id: UUID,
    payload: OrganizationStateUpdate,
    admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
):
    organization = await db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy doanh nghiệp")
    organization.is_active = payload.is_active
    db.add(
        AuditLog(
            organization_id=organization.id,
            actor_user_id=admin.id,
            action="ORGANIZATION_STATE_CHANGED",
            resource_type="organization",
            resource_id=str(organization.id),
            metadata_redacted=f'{{"is_active": {str(payload.is_active).lower()}}}',
        )
    )
    return organization
