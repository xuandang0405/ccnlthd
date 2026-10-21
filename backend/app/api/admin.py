"""API quản trị: tổng quan, doanh nghiệp, tài liệu, thanh toán và nhật ký.

API người dùng, chatbot và ticket nằm trong các file admin_* để dễ đọc hơn.
"""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, delete, func, or_, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import admin_chatbots, admin_tickets, admin_users
from app.api.admin_common import organization_names
from app.api.deps import get_super_admin
from app.core.database import get_db
from app.core.records import add_record, make_record, update_record
from app.integrations.gemini import GeminiServiceError
from app.models.entities import (
    AuditLog,
    Chatbot,
    ChatbotDocument,
    Conversation,
    Document,
    DocumentStatus,
    Lead,
    Organization,
    PaymentOrder,
    PaymentStatus,
    SupportTicket,
    SystemSetting,
    User,
)
from app.schemas.admin import (
    AdminAuditEvent,
    AdminDocument,
    AdminOrganization,
    AdminPayment,
    AdminSummary,
    DocumentApprovalUpdate,
    ModerationSettings,
    OrganizationStateUpdate,
)
from app.services.document_links import link_document_to_chatbots, revoke_auto_approvals
from app.services.document_review import review_catalog_with_ai

router = APIRouter(prefix="/admin", tags=["Super Admin"])


@router.get("/summary", response_model=AdminSummary)
async def summary(
    _: Any = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    return AdminSummary(
        organizations=await db.scalar(select(func.count()).select_from(Organization).where(true())),
        users=await db.scalar(select(func.count()).select_from(User).where(true())),
        chatbots=await db.scalar(select(func.count()).select_from(Chatbot).where(true())),
        conversations=await db.scalar(select(func.count()).select_from(Conversation).where(true())),
        leads=await db.scalar(select(func.count()).select_from(Lead).where(true())),
        documents_processing=await db.scalar(
            select(func.count())
            .select_from(Document)
            .where(
                Document.status.in_(
                    [DocumentStatus.UPLOADED.value, DocumentStatus.PROCESSING.value]
                )
            )
        ),
        payments_pending=await db.scalar(
            select(func.count())
            .select_from(PaymentOrder)
            .where(PaymentOrder.status == PaymentStatus.PENDING.value)
        ),
        documents_pending_review=await db.scalar(
            select(func.count())
            .select_from(Document)
            .where(
                and_(
                    Document.status == DocumentStatus.DONE.value,
                    or_(
                        (Document.approval_status == "PENDING"),
                        (Document.approval_status.is_(None)),
                    ),
                )
            )
        ),
        tickets_open=await db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.status.in_(["OPEN", "IN_PROGRESS"]))
        ),
        tickets_unread=await db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.admin_unread_count > 0)
        ),
    )


@router.get("/organizations", response_model=list[AdminOrganization])
async def organizations(
    limit: int = Query(default=100, ge=1, le=500),
    _: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    documents = (
        await db.scalars(
            select(Organization)
            .where(true())
            .order_by(Organization.created_at.desc())
            .limit(limit)
            .execution_options(populate_existing=True)
        )
    ).all()
    return [document for document in documents]


@router.patch("/organizations/{organization_id}", response_model=AdminOrganization)
async def set_organization_state(
    organization_id: UUID,
    payload: OrganizationStateUpdate,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    query = Organization.id == str(organization_id)
    result = await db.execute(
        update(Organization)
        .where(query)
        .values(**{**{"is_active": payload.is_active, "updated_at": datetime.now(UTC)}})
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy doanh nghiệp")
    await add_record(
        db,
        AuditLog,
        make_record(
            organization_id=str(organization_id),
            actor_user_id=str(admin.id),
            action="ORGANIZATION_STATE_CHANGED",
            resource_type="organization",
            resource_id=str(organization_id),
            metadata_redacted=json.dumps({"is_active": payload.is_active}),
        ),
    )
    return await db.scalar(
        select(Organization).where(query).limit(1).execution_options(populate_existing=True)
    )


@router.get("/documents", response_model=list[AdminDocument])
async def all_documents(
    _: Any = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    names = await organization_names(db)
    documents = (
        await db.scalars(
            select(Document)
            .where(true())
            .order_by(Document.created_at.desc())
            .limit(500)
            .execution_options(populate_existing=True)
        )
    ).all()
    return [
        {
            "id": item["id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "original_name": item["original_name"],
            "status": item["status"],
            "approval_status": item.get("approval_status", "PENDING"),
            "approval_note": item.get("approval_note"),
            "ai_review": item.get("ai_review"),
            "size_bytes": item["size_bytes"],
            "created_at": item["created_at"],
        }
        for item in documents
    ]


@router.post("/documents/{document_id}/ai-review", response_model=AdminDocument)
async def run_document_review(
    document_id: UUID,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    moderation = await db.scalar(
        select(SystemSetting)
        .where(SystemSetting.id == "document_moderation")
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not moderation or not moderation.get("auto_review", False):
        raise HTTPException(status_code=409, detail="Duyệt AI đang tắt; hãy duyệt tay")
    document = await db.scalar(
        select(Document)
        .where(Document.id == str(document_id))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if (
        document is None
        or document.get("status") != DocumentStatus.DONE.value
        or not document.get("extracted_text")
    ):
        raise HTTPException(status_code=409, detail="Tài liệu chưa có nội dung để kiểm tra")
    if document.get("approval_status") == "APPROVED":
        raise HTTPException(status_code=409, detail="Tài liệu đã được duyệt")
    try:
        review = await review_catalog_with_ai(document.get("extracted_text") or "")
    except GeminiServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    approval_status = "APPROVED" if review.passed else "PENDING"
    await db.execute(
        update(Document)
        .where(Document.id == str(document_id))
        .values(
            **{
                **{
                    "ai_review": review.as_dict(),
                    "approval_status": approval_status,
                    "approval_note": review.summary,
                    "approved_at": datetime.now(UTC) if review.passed else None,
                    "approved_by_user_id": None,
                    "updated_at": datetime.now(UTC),
                }
            }
        )
    )
    if review.passed:
        await link_document_to_chatbots(
            db, organization_id=document["organization_id"], document_id=str(document_id)
        )
    else:
        await db.execute(
            delete(ChatbotDocument).where(ChatbotDocument.document_id == str(document_id))
        )
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.patch("/documents/{document_id}/approval", response_model=AdminDocument)
async def review_document(
    document_id: UUID,
    payload: DocumentApprovalUpdate,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    document = await db.scalar(
        select(Document)
        .where(Document.id == str(document_id))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if (
        payload.approval_status == "APPROVED"
        and document.get("status") != DocumentStatus.DONE.value
    ):
        raise HTTPException(status_code=409, detail="Tài liệu chưa xử lý xong")
    result = await db.execute(
        update(Document)
        .where(Document.id == str(document_id))
        .values(
            **{
                **{
                    "approval_status": payload.approval_status,
                    "approval_note": payload.note
                    or (
                        "Admin đã duyệt"
                        if payload.approval_status == "APPROVED"
                        else "Admin yêu cầu kiểm tra lại"
                    ),
                    "approved_at": datetime.now(UTC)
                    if payload.approval_status == "APPROVED"
                    else None,
                    "approved_by_user_id": str(admin.id),
                    "updated_at": datetime.now(UTC),
                }
            }
        )
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if payload.approval_status == "APPROVED":
        await link_document_to_chatbots(
            db, organization_id=document["organization_id"], document_id=str(document_id)
        )
    else:
        await db.execute(
            delete(ChatbotDocument).where(ChatbotDocument.document_id == str(document_id))
        )
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.get("/settings/moderation", response_model=ModerationSettings)
async def moderation_settings(
    _: Any = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    document = await db.scalar(
        select(SystemSetting)
        .where(SystemSetting.id == "document_moderation")
        .limit(1)
        .execution_options(populate_existing=True)
    )
    return ModerationSettings(
        auto_review=False if document is None else document.get("auto_review", False)
    )


@router.put("/settings/moderation", response_model=ModerationSettings)
async def update_moderation_settings(
    payload: ModerationSettings,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    await update_record(
        db,
        SystemSetting,
        (SystemSetting.id == "document_moderation"),
        values={"auto_review": payload.auto_review, "updated_at": datetime.now(UTC)},
        defaults=make_record(**{"id": "document_moderation"}),
    )
    if not payload.auto_review:
        await revoke_auto_approvals(db)
    await add_record(
        db,
        AuditLog,
        make_record(
            actor_user_id=str(admin.id),
            action="ADMIN_MODERATION_UPDATED",
            resource_type="system_setting",
            resource_id="document_moderation",
            metadata_redacted=json.dumps({"auto_review": payload.auto_review}),
        ),
    )
    return payload


@router.get("/payments", response_model=list[AdminPayment])
async def all_payments(
    _: Any = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    names = await organization_names(db)
    documents = (
        await db.scalars(
            select(PaymentOrder)
            .where(true())
            .order_by(PaymentOrder.created_at.desc())
            .limit(500)
            .execution_options(populate_existing=True)
        )
    ).all()
    return [
        {
            "id": item["id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "order_code": item["order_code"],
            "product_name": item.get("product_name", "Đơn hàng cũ"),
            "amount": item["amount"],
            "status": item["status"],
            "created_at": item["created_at"],
        }
        for item in documents
    ]


@router.get("/audit-logs", response_model=list[AdminAuditEvent])
async def audit_logs(
    _: Any = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    events = (
        await db.scalars(
            select(AuditLog)
            .where(true())
            .order_by(AuditLog.created_at.desc())
            .limit(100)
            .execution_options(populate_existing=True)
        )
    ).all()
    actor_ids = [event.get("actor_user_id") for event in events]
    actors = {
        item["id"]: item["email"]
        for item in (
            await db.scalars(
                select(User).where(User.id.in_(actor_ids)).execution_options(populate_existing=True)
            )
        ).all()
    }
    return [
        {
            "id": event["id"],
            "actor_email": actors.get(event.get("actor_user_id"), "—"),
            "action": event["action"],
            "resource_type": event.get("resource_type", "—"),
            "resource_id": str(event.get("resource_id", "—")),
            "metadata_redacted": event.get("metadata_redacted"),
            "created_at": event["created_at"],
        }
        for event in events
    ]


# Các nhóm endpoint dài nằm ở module riêng nhưng vẫn giữ URL /admin/...
router.include_router(admin_users.router)
router.include_router(admin_chatbots.router)
router.include_router(admin_tickets.router)
