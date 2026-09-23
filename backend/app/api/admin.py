import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_super_admin
from app.core.mongodb import get_mongo_db, new_document, record
from app.models.entities import DocumentStatus, PaymentStatus
from app.schemas.admin import (
    AdminChatbot,
    AdminDocument,
    AdminOrganization,
    AdminPayment,
    AdminSummary,
    AdminUser,
    ChatbotStateUpdate,
    DocumentApprovalUpdate,
    ModerationSettings,
    OrganizationStateUpdate,
    UserStateUpdate,
)
from app.schemas.ticket import TicketReplyCreate, TicketResponse, TicketStatusUpdate
from app.services.document_review import review_catalog

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
        documents_pending_review=await db.documents.count_documents(
            {"status": DocumentStatus.DONE.value, "approval_status": "PENDING"}
        ),
        tickets_open=await db.support_tickets.count_documents(
            {"status": {"$in": ["OPEN", "IN_PROGRESS"]}}
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


async def organization_names(db: Any) -> dict[str, str]:
    items = await db.organizations.find({}, {"name": 1}).to_list(None)
    return {item["_id"]: item["name"] for item in items}


@router.get("/users", response_model=list[AdminUser])
async def users(
    limit: int = Query(default=200, ge=1, le=500),
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    names = await organization_names(db)
    documents = await db.users.find({}).sort("created_at", -1).limit(limit).to_list(None)
    memberships = await db.organization_members.find({}).to_list(None)
    by_user: dict[str, list[str]] = {}
    for item in memberships:
        by_user.setdefault(item["user_id"], []).append(names.get(item["organization_id"], "—"))
    return [
        {
            "id": item["_id"],
            "email": item["email"],
            "full_name": item["full_name"],
            "is_active": item.get("is_active", True),
            "is_super_admin": item.get("is_super_admin", False),
            "organizations": by_user.get(item["_id"], []),
            "created_at": item["created_at"],
        }
        for item in documents
    ]


@router.patch("/users/{user_id}", response_model=AdminUser)
async def set_user_state(
    user_id: UUID,
    payload: UserStateUpdate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    if str(admin.id) == str(user_id) and not payload.is_active:
        raise HTTPException(status_code=409, detail="Không thể tự vô hiệu hóa tài khoản Admin")
    result = await db.users.update_one(
        {"_id": str(user_id)},
        {"$set": {"is_active": payload.is_active, "updated_at": datetime.now(UTC)}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return await _admin_user(db, str(user_id))


async def _admin_user(db: Any, user_id: str) -> dict:
    item = await db.users.find_one({"_id": user_id})
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    names = await organization_names(db)
    memberships = await db.organization_members.find({"user_id": user_id}).to_list(None)
    return {
        "id": item["_id"],
        "email": item["email"],
        "full_name": item["full_name"],
        "is_active": item.get("is_active", True),
        "is_super_admin": item.get("is_super_admin", False),
        "organizations": [names.get(member["organization_id"], "—") for member in memberships],
        "created_at": item["created_at"],
    }


@router.get("/chatbots", response_model=list[AdminChatbot])
async def all_chatbots(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    names = await organization_names(db)
    documents = await db.chatbots.find({}).sort("created_at", -1).limit(500).to_list(None)
    return [
        {
            "id": item["_id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "name": item["name"],
            "public_id": item["public_id"],
            "is_active": item.get("is_active", True),
            "credit_balance": item.get("credit_balance", 0),
            "usage_count": item.get("usage_count", 0),
            "created_at": item["created_at"],
        }
        for item in documents
    ]


@router.patch("/chatbots/{chatbot_id}", response_model=AdminChatbot)
async def set_chatbot_state(
    chatbot_id: UUID,
    payload: ChatbotStateUpdate,
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    result = await db.chatbots.update_one(
        {"_id": str(chatbot_id)},
        {"$set": {"is_active": payload.is_active, "updated_at": datetime.now(UTC)}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    items = await all_chatbots(_, db)
    return next(item for item in items if str(item["id"]) == str(chatbot_id))


@router.get("/documents", response_model=list[AdminDocument])
async def all_documents(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    names = await organization_names(db)
    documents = await db.documents.find({}).sort("created_at", -1).limit(500).to_list(None)
    return [
        {
            "id": item["_id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "original_name": item["original_name"],
            "status": item["status"],
            "approval_status": item.get("approval_status", "APPROVED"),
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
    db: Any = Depends(get_mongo_db),
):
    document = await db.documents.find_one({"_id": str(document_id)})
    if document is None or not document.get("extracted_text"):
        raise HTTPException(status_code=409, detail="Tài liệu chưa có nội dung để kiểm tra")
    review = review_catalog(document["extracted_text"])
    approval_status = "APPROVED" if review.passed else "PENDING"
    await db.documents.update_one(
        {"_id": str(document_id)},
        {
            "$set": {
                "ai_review": review.as_dict(),
                "approval_status": approval_status,
                "approval_note": review.summary,
                "approved_at": datetime.now(UTC) if review.passed else None,
                "approved_by_user_id": str(admin.id) if review.passed else None,
                "updated_at": datetime.now(UTC),
            }
        },
    )
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.patch("/documents/{document_id}/approval", response_model=AdminDocument)
async def review_document(
    document_id: UUID,
    payload: DocumentApprovalUpdate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    result = await db.documents.update_one(
        {"_id": str(document_id)},
        {
            "$set": {
                "approval_status": payload.approval_status,
                "approval_note": payload.note,
                "approved_at": datetime.now(UTC) if payload.approval_status == "APPROVED" else None,
                "approved_by_user_id": str(admin.id),
                "updated_at": datetime.now(UTC),
            }
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.get("/settings/moderation", response_model=ModerationSettings)
async def moderation_settings(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    document = await db.system_settings.find_one({"_id": "document_moderation"})
    return ModerationSettings(
        auto_review=True if document is None else document.get("auto_review", True)
    )


@router.put("/settings/moderation", response_model=ModerationSettings)
async def update_moderation_settings(
    payload: ModerationSettings,
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    await db.system_settings.update_one(
        {"_id": "document_moderation"},
        {"$set": {"auto_review": payload.auto_review, "updated_at": datetime.now(UTC)}},
        upsert=True,
    )
    return payload


@router.get("/payments", response_model=list[AdminPayment])
async def all_payments(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    names = await organization_names(db)
    documents = await db.payment_orders.find({}).sort("created_at", -1).limit(500).to_list(None)
    return [
        {
            "id": item["_id"],
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


def _ticket_response(item: dict[str, Any], name: str | None = None) -> dict:
    return {
        "id": item["_id"],
        **{k: v for k, v in item.items() if k != "_id"},
        "organization_name": name,
    }


@router.get("/tickets", response_model=list[TicketResponse])
async def all_tickets(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    names = await organization_names(db)
    documents = await db.support_tickets.find({}).sort("updated_at", -1).limit(500).to_list(None)
    return [_ticket_response(item, names.get(item["organization_id"])) for item in documents]


@router.post("/tickets/{ticket_id}/replies", response_model=TicketResponse)
async def admin_ticket_reply(
    ticket_id: UUID,
    payload: TicketReplyCreate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    now = datetime.now(UTC)
    result = await db.support_tickets.update_one(
        {"_id": str(ticket_id)},
        {
            "$push": {
                "messages": {
                    "sender_type": "ADMIN",
                    "sender_user_id": str(admin.id),
                    "sender_name": admin.full_name,
                    "message": payload.message.strip(),
                    "created_at": now,
                }
            },
            "$set": {"status": "IN_PROGRESS", "updated_at": now},
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    item = await db.support_tickets.find_one({"_id": str(ticket_id)})
    names = await organization_names(db)
    return _ticket_response(item, names.get(item["organization_id"]))


@router.patch("/tickets/{ticket_id}/status", response_model=TicketResponse)
async def update_ticket_status(
    ticket_id: UUID,
    payload: TicketStatusUpdate,
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    result = await db.support_tickets.update_one(
        {"_id": str(ticket_id)},
        {"$set": {"status": payload.status, "updated_at": datetime.now(UTC)}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    item = await db.support_tickets.find_one({"_id": str(ticket_id)})
    names = await organization_names(db)
    return _ticket_response(item, names.get(item["organization_id"]))
