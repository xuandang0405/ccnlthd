import json
import re
import secrets
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.api.deps import get_super_admin
from app.core.mongodb import get_mongo_db, new_document, record
from app.core.security import hash_password
from app.integrations.gemini import GeminiServiceError
from app.models.entities import DocumentStatus, PaymentStatus
from app.schemas.admin import (
    AdminAuditEvent,
    AdminChatbot,
    AdminCreditAdjustment,
    AdminDocument,
    AdminOrganization,
    AdminPayment,
    AdminSlotAdjustment,
    AdminSummary,
    AdminUser,
    AdminUserCreditAdjustment,
    DocumentApprovalUpdate,
    ModerationSettings,
    OrganizationStateUpdate,
    UserStateUpdate,
)
from app.schemas.chatbot import ChatbotUpdate
from app.schemas.ticket import TicketReplyCreate, TicketResponse, TicketStatusUpdate
from app.services.credits import ensure_credit_account, ensure_organization_limits
from app.services.document_links import link_document_to_chatbots, revoke_auto_approvals
from app.services.document_review import review_catalog_with_ai
from app.services.ticket_attachments import (
    attachment_path,
    find_attachment,
    save_ticket_files,
)

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
            {
                "status": DocumentStatus.DONE.value,
                "$or": [
                    {"approval_status": "PENDING"},
                    {"approval_status": {"$exists": False}},
                ],
            }
        ),
        tickets_open=await db.support_tickets.count_documents(
            {"status": {"$in": ["OPEN", "IN_PROGRESS"]}}
        ),
        tickets_unread=await db.support_tickets.count_documents({"admin_unread_count": {"$gt": 0}}),
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
    search: str = Query(default="", max_length=100),
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    names = await organization_names(db)
    query = (
        {"$or": [
            {"email": {"$regex": re.escape(search.strip()), "$options": "i"}},
            {"full_name": {"$regex": re.escape(search.strip()), "$options": "i"}},
        ]}
        if search.strip() else {}
    )
    documents = await db.users.find(query).sort("created_at", -1).limit(limit).to_list(None)
    memberships = await db.organization_members.find({}).to_list(None)
    credits = await db.organization_credits.find({}).to_list(None)
    by_organization = {item["organization_id"]: item for item in credits}
    limits = await db.organization_limits.find({}).to_list(None)
    limits_by_organization = {item["organization_id"]: item for item in limits}
    bots = await db.chatbots.find({}, {"organization_id": 1}).to_list(None)
    chatbot_counts: dict[str, int] = {}
    for bot in bots:
        chatbot_counts[bot["organization_id"]] = chatbot_counts.get(bot["organization_id"], 0) + 1
    by_user: dict[str, list[dict[str, Any]]] = {}
    for item in memberships:
        organization_id = item["organization_id"]
        balance = by_organization.get(organization_id, {})
        by_user.setdefault(item["user_id"], []).append(
            {
                "id": organization_id,
                "name": names.get(organization_id, "—"),
                "free_remaining": int(balance.get("free_remaining", 0)),
                "purchased_remaining": int(balance.get("purchased_remaining", 0)),
                "chatbot_slots": int(
                    limits_by_organization.get(organization_id, {}).get("chatbot_slots", 1)
                ),
                "chatbot_count": chatbot_counts.get(organization_id, 0),
            }
        )
    return [
        {
            "id": item["_id"],
            "email": item["email"],
            "full_name": item["full_name"],
            "is_active": item.get("is_active", True),
            "is_super_admin": item.get("is_super_admin", False),
            "organizations": [account["name"] for account in by_user.get(item["_id"], [])],
            "organization_accounts": by_user.get(item["_id"], []),
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
    values = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(status_code=422, detail="Chưa có thông tin cần cập nhật")
    if str(admin.id) == str(user_id) and values.get("is_active") is False:
        raise HTTPException(status_code=409, detail="Không thể tự vô hiệu hóa tài khoản Admin")
    if str(admin.id) == str(user_id) and values.get("is_super_admin") is False:
        raise HTTPException(status_code=409, detail="Không thể tự tước quyền Admin")
    if "full_name" in values:
        values["full_name"] = values["full_name"].strip()
        if len(values["full_name"]) < 2:
            raise HTTPException(status_code=422, detail="Tên phải có ít nhất 2 ký tự")
    if "email" in values:
        values["email"] = values["email"].lower()
    now = datetime.now(UTC)
    try:
        result = await db.users.update_one(
            {"_id": str(user_id)}, {"$set": {**values, "updated_at": now}}
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email đã được sử dụng") from exc
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if values.get("is_active") is False:
        await db.refresh_sessions.update_many(
            {"user_id": str(user_id), "revoked_at": None}, {"$set": {"revoked_at": now}}
        )
    await db.audit_logs.insert_one(
        new_document(
            actor_user_id=str(admin.id), action="ADMIN_USER_UPDATED",
            resource_type="user", resource_id=str(user_id),
            metadata_redacted=json.dumps(values),
        )
    )
    return await _admin_user(db, str(user_id))


async def _admin_user(db: Any, user_id: str) -> dict:
    item = await db.users.find_one({"_id": user_id})
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    names = await organization_names(db)
    memberships = await db.organization_members.find({"user_id": user_id}).to_list(None)
    organization_ids = [member["organization_id"] for member in memberships]
    balances = await db.organization_credits.find(
        {"organization_id": {"$in": organization_ids}}
    ).to_list(None)
    by_organization = {balance["organization_id"]: balance for balance in balances}
    limits = await db.organization_limits.find(
        {"organization_id": {"$in": organization_ids}}
    ).to_list(None)
    limits_by_organization = {limit["organization_id"]: limit for limit in limits}
    accounts = [
        {
            "id": org_id,
            "name": names.get(org_id, "—"),
            "free_remaining": int(by_organization.get(org_id, {}).get("free_remaining", 0)),
            "purchased_remaining": int(
                by_organization.get(org_id, {}).get("purchased_remaining", 0)
            ),
            "chatbot_slots": int(limits_by_organization.get(org_id, {}).get("chatbot_slots", 1)),
            "chatbot_count": await db.chatbots.count_documents({"organization_id": org_id}),
        }
        for org_id in organization_ids
    ]
    return {
        "id": item["_id"],
        "email": item["email"],
        "full_name": item["full_name"],
        "is_active": item.get("is_active", True),
        "is_super_admin": item.get("is_super_admin", False),
        "organizations": [account["name"] for account in accounts],
        "organization_accounts": accounts,
        "created_at": item["created_at"],
    }


@router.post("/users/{user_id}/credits")
async def adjust_user_credits(
    user_id: UUID,
    payload: AdminUserCreditAdjustment,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số lượt phải khác 0")
    user_id_value = str(user_id)
    organization_id = str(payload.organization_id)
    member = await db.organization_members.find_one(
        {"user_id": user_id_value, "organization_id": organization_id}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Người dùng không thuộc doanh nghiệp này")
    await ensure_credit_account(db, organization_id)
    now = datetime.now(UTC)
    async with db.client.start_session() as session:
        async with await session.start_transaction():
            account = await db.organization_credits.find_one_and_update(
                {
                    "organization_id": organization_id,
                    **(
                        {"purchased_remaining": {"$gte": -payload.amount}}
                        if payload.amount < 0 else {}
                    ),
                },
                {"$inc": {"purchased_remaining": payload.amount}, "$set": {"updated_at": now}},
                return_document=ReturnDocument.AFTER,
                session=session,
            )
            if account is None:
                raise HTTPException(status_code=409, detail="Ví chung không đủ lượt để thu hồi")
            await db.audit_logs.insert_one(
                new_document(
                    organization_id=organization_id,
                    actor_user_id=str(admin.id),
                    action="ADMIN_USER_CREDITS_ADJUSTED",
                    resource_type="user",
                    resource_id=user_id_value,
                    metadata_redacted=json.dumps(
                        {"amount": payload.amount, "reason": payload.reason.strip()}
                    ),
                ),
                session=session,
            )
    return {
        "organization_id": organization_id,
        "purchased_remaining": account["purchased_remaining"],
    }


@router.post("/users/{user_id}/slots")
async def adjust_user_slots(
    user_id: UUID,
    payload: AdminSlotAdjustment,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số vị trí phải khác 0")
    organization_id = str(payload.organization_id)
    member = await db.organization_members.find_one(
        {"user_id": str(user_id), "organization_id": organization_id}
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Người dùng không thuộc doanh nghiệp này")
    await ensure_organization_limits(db, organization_id)
    chatbot_count = await db.chatbots.count_documents({"organization_id": organization_id})
    minimum = max(1, chatbot_count) - payload.amount
    now = datetime.now(UTC)
    async with db.client.start_session() as session:
        async with await session.start_transaction():
            limits = await db.organization_limits.find_one_and_update(
                {
                    "organization_id": organization_id,
                    **({"chatbot_slots": {"$gte": minimum}} if payload.amount < 0 else {}),
                },
                {"$inc": {"chatbot_slots": payload.amount}, "$set": {"updated_at": now}},
                return_document=ReturnDocument.AFTER,
                session=session,
            )
            if limits is None:
                raise HTTPException(
                    status_code=409, detail="Không thể thu hồi dưới số chatbot đang dùng"
                )
            await db.audit_logs.insert_one(
                new_document(
                    organization_id=organization_id,
                    actor_user_id=str(admin.id),
                    action="ADMIN_CHATBOT_SLOTS_ADJUSTED",
                    resource_type="user",
                    resource_id=str(user_id),
                    metadata_redacted=json.dumps(
                        {"amount": payload.amount, "reason": payload.reason.strip()}
                    ),
                ),
                session=session,
            )
    return {"organization_id": organization_id, "chatbot_slots": limits["chatbot_slots"]}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    if str(user_id) == str(admin.id):
        raise HTTPException(status_code=409, detail="Không thể tự đặt lại mật khẩu Admin tại đây")
    temporary_password = "aA1" + secrets.token_urlsafe(18)
    now = datetime.now(UTC)
    async with db.client.start_session() as session:
        async with await session.start_transaction():
            result = await db.users.update_one(
                {"_id": str(user_id)},
                {"$set": {"password_hash": hash_password(temporary_password), "updated_at": now}},
                session=session,
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
            await db.refresh_sessions.update_many(
                {"user_id": str(user_id), "revoked_at": None},
                {"$set": {"revoked_at": now}},
                session=session,
            )
            await db.audit_logs.insert_one(
                new_document(
                    actor_user_id=str(admin.id),
                    action="ADMIN_USER_PASSWORD_RESET",
                    resource_type="user",
                    resource_id=str(user_id),
                    metadata_redacted="{}",
                ),
                session=session,
            )
    return {"temporary_password": temporary_password}


@router.get("/chatbots", response_model=list[AdminChatbot])
async def all_chatbots(
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
    search: str = Query(default="", max_length=100),
):
    names = await organization_names(db)
    query = (
        {"$or": [
            {"name": {"$regex": re.escape(search.strip()), "$options": "i"}},
            {"public_id": search.strip()},
        ]}
        if search.strip() else {}
    )
    documents = await db.chatbots.find(query).sort("created_at", -1).limit(500).to_list(None)
    memberships = await db.organization_members.find({"role": "BUSINESS_OWNER"}).to_list(None)
    user_ids = [member["user_id"] for member in memberships]
    owners = {
        item["_id"]: item["email"]
        for item in await db.users.find({"_id": {"$in": user_ids}}).to_list(None)
    }
    owner_emails: dict[str, list[str]] = {}
    for member in memberships:
        if email := owners.get(member["user_id"]):
            owner_emails.setdefault(member["organization_id"], []).append(email)
    return [
        {
            "id": item["_id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "owner_emails": owner_emails.get(item["organization_id"], []),
            "name": item["name"],
            "public_id": item["public_id"],
            "description": item.get("description"),
            "greeting": item.get("greeting", ""),
            "tone": item.get("tone", "professional"),
            "primary_color": item.get("primary_color", "#2563eb"),
            "is_active": item.get("is_active", True),
            "credit_balance": item.get("credit_balance", 0),
            "usage_count": item.get("usage_count", 0),
            "created_at": item["created_at"],
        }
        for item in documents
    ]


async def _admin_chatbot(db: Any, chatbot_id: str) -> dict:
    item = await db.chatbots.find_one({"_id": chatbot_id})
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    organization = await db.organizations.find_one({"_id": item["organization_id"]})
    memberships = await db.organization_members.find(
        {"organization_id": item["organization_id"], "role": "BUSINESS_OWNER"}
    ).to_list(None)
    owners = await db.users.find(
        {"_id": {"$in": [member["user_id"] for member in memberships]}}
    ).to_list(None)
    return {
        "id": chatbot_id,
        "organization_id": item["organization_id"],
        "organization_name": organization["name"] if organization else "—",
        "owner_emails": [owner["email"] for owner in owners],
        "name": item["name"],
        "public_id": item["public_id"],
        "description": item.get("description"),
        "greeting": item.get("greeting", ""),
        "tone": item.get("tone", "professional"),
        "primary_color": item.get("primary_color", "#2563eb"),
        "is_active": item.get("is_active", True),
        "credit_balance": item.get("credit_balance", 0),
        "usage_count": item.get("usage_count", 0),
        "created_at": item["created_at"],
    }


@router.patch("/chatbots/{chatbot_id}", response_model=AdminChatbot)
async def set_chatbot_state(
    chatbot_id: UUID,
    payload: ChatbotUpdate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    values = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(status_code=422, detail="Chưa có thông tin cần cập nhật")
    result = await db.chatbots.update_one(
        {"_id": str(chatbot_id)},
        {"$set": {**values, "updated_at": datetime.now(UTC)}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    await db.audit_logs.insert_one(
        new_document(
            actor_user_id=str(admin.id), action="ADMIN_CHATBOT_UPDATED",
            resource_type="chatbot", resource_id=str(chatbot_id),
            metadata_redacted=json.dumps(values),
        )
    )
    return await _admin_chatbot(db, str(chatbot_id))


@router.post("/chatbots/{chatbot_id}/credits", response_model=AdminChatbot)
async def adjust_chatbot_credits(
    chatbot_id: UUID,
    payload: AdminCreditAdjustment,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số lượt phải khác 0")
    chatbot_id_value = str(chatbot_id)
    now = datetime.now(UTC)
    async with db.client.start_session() as session:
        async with await session.start_transaction():
            chatbot = await db.chatbots.find_one_and_update(
                {
                    "_id": chatbot_id_value,
                    **(
                        {"credit_balance": {"$gte": -payload.amount}}
                        if payload.amount < 0 else {}
                    ),
                },
                {"$inc": {"credit_balance": payload.amount}, "$set": {"updated_at": now}},
                return_document=ReturnDocument.AFTER,
                session=session,
            )
            if chatbot is None:
                if await db.chatbots.find_one({"_id": chatbot_id_value}, session=session):
                    raise HTTPException(status_code=409, detail="Chatbot không đủ lượt để thu hồi")
                raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
            await db.audit_logs.insert_one(
                new_document(
                    organization_id=chatbot["organization_id"],
                    actor_user_id=str(admin.id),
                    action="ADMIN_CHATBOT_CREDITS_ADJUSTED",
                    resource_type="chatbot",
                    resource_id=chatbot_id_value,
                    metadata_redacted=json.dumps(
                        {"amount": payload.amount, "reason": payload.reason.strip()}
                    ),
                ),
                session=session,
            )
    return await _admin_chatbot(db, chatbot_id_value)


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
    db: Any = Depends(get_mongo_db),
):
    moderation = await db.system_settings.find_one({"_id": "document_moderation"})
    if not moderation or not moderation.get("auto_review", False):
        raise HTTPException(status_code=409, detail="Duyệt AI đang tắt; hãy duyệt tay")
    document = await db.documents.find_one({"_id": str(document_id)})
    if (
        document is None or document.get("status") != DocumentStatus.DONE.value
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
    await db.documents.update_one(
        {"_id": str(document_id)},
        {
            "$set": {
                "ai_review": review.as_dict(),
                "approval_status": approval_status,
                "approval_note": review.summary,
                "approved_at": datetime.now(UTC) if review.passed else None,
                "approved_by_user_id": None,
                "updated_at": datetime.now(UTC),
            }
        },
    )
    if review.passed:
        await link_document_to_chatbots(
            db, organization_id=document["organization_id"], document_id=str(document_id)
        )
    else:
        await db.chatbot_documents.delete_many({"document_id": str(document_id)})
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.patch("/documents/{document_id}/approval", response_model=AdminDocument)
async def review_document(
    document_id: UUID,
    payload: DocumentApprovalUpdate,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    document = await db.documents.find_one({"_id": str(document_id)})
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if (
        payload.approval_status == "APPROVED"
        and document.get("status") != DocumentStatus.DONE.value
    ):
        raise HTTPException(status_code=409, detail="Tài liệu chưa xử lý xong")
    result = await db.documents.update_one(
        {"_id": str(document_id)},
        {
            "$set": {
                "approval_status": payload.approval_status,
                "approval_note": payload.note or (
                    "Admin đã duyệt" if payload.approval_status == "APPROVED"
                    else "Admin yêu cầu kiểm tra lại"
                ),
                "approved_at": datetime.now(UTC) if payload.approval_status == "APPROVED" else None,
                "approved_by_user_id": str(admin.id),
                "updated_at": datetime.now(UTC),
            }
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if payload.approval_status == "APPROVED":
        await link_document_to_chatbots(
            db, organization_id=document["organization_id"], document_id=str(document_id)
        )
    else:
        await db.chatbot_documents.delete_many({"document_id": str(document_id)})
    items = await all_documents(admin, db)
    return next(item for item in items if str(item["id"]) == str(document_id))


@router.get("/settings/moderation", response_model=ModerationSettings)
async def moderation_settings(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    document = await db.system_settings.find_one({"_id": "document_moderation"})
    return ModerationSettings(
        auto_review=False if document is None else document.get("auto_review", False)
    )


@router.put("/settings/moderation", response_model=ModerationSettings)
async def update_moderation_settings(
    payload: ModerationSettings,
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    await db.system_settings.update_one(
        {"_id": "document_moderation"},
        {"$set": {"auto_review": payload.auto_review, "updated_at": datetime.now(UTC)}},
        upsert=True,
    )
    if not payload.auto_review:
        await revoke_auto_approvals(db)
    await db.audit_logs.insert_one(new_document(
        actor_user_id=str(admin.id), action="ADMIN_MODERATION_UPDATED",
        resource_type="system_setting", resource_id="document_moderation",
        metadata_redacted=json.dumps({"auto_review": payload.auto_review}),
    ))
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


@router.get("/audit-logs", response_model=list[AdminAuditEvent])
async def audit_logs(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    events = await db.audit_logs.find({}).sort("created_at", -1).limit(100).to_list(None)
    actor_ids = [event.get("actor_user_id") for event in events]
    actors = {
        item["_id"]: item["email"]
        for item in await db.users.find({"_id": {"$in": actor_ids}}).to_list(None)
    }
    return [
        {
            "id": event["_id"],
            "actor_email": actors.get(event.get("actor_user_id"), "—"),
            "action": event["action"],
            "resource_type": event.get("resource_type", "—"),
            "resource_id": str(event.get("resource_id", "—")),
            "metadata_redacted": event.get("metadata_redacted"),
            "created_at": event["created_at"],
        }
        for event in events
    ]


def _ticket_response(
    item: dict[str, Any], name: str | None = None, creator: dict[str, Any] | None = None
) -> dict:
    response = {
        "id": item["_id"],
        **{k: v for k, v in item.items() if k != "_id"},
        "organization_name": name,
    }
    if creator:
        response["created_by_email"] = response.get("created_by_email") or creator.get("email")
        response["created_by_name"] = response.get("created_by_name") or creator.get("full_name")
    return response


@router.get("/tickets", response_model=list[TicketResponse])
async def all_tickets(_: Any = Depends(get_super_admin), db: Any = Depends(get_mongo_db)):
    names = await organization_names(db)
    documents = await db.support_tickets.find({}).sort("updated_at", -1).limit(500).to_list(None)
    creator_ids = list(
        {item.get("created_by_user_id") for item in documents if item.get("created_by_user_id")}
    )
    creators = {
        item["_id"]: item
        for item in await db.users.find({"_id": {"$in": creator_ids}}).to_list(None)
    }
    return [
        _ticket_response(
            item,
            names.get(item["organization_id"]),
            creators.get(item.get("created_by_user_id")),
        )
        for item in documents
    ]


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
                    "attachments": [],
                }
            },
            "$set": {"status": "IN_PROGRESS", "updated_at": now},
            "$inc": {"customer_unread_count": 1},
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    item = await db.support_tickets.find_one({"_id": str(ticket_id)})
    names = await organization_names(db)
    return _ticket_response(item, names.get(item["organization_id"]))


@router.post("/tickets/{ticket_id}/attachments", response_model=TicketResponse)
async def admin_ticket_attachment(
    ticket_id: UUID,
    files: list[UploadFile] = File(),
    message: str = Form(default=""),
    admin: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(ticket_id)}
    ticket = await db.support_tickets.find_one(query)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    clean_message = message.strip()
    if len(clean_message) > 5000:
        raise HTTPException(status_code=422, detail="Tin nhắn tối đa 5000 ký tự")
    attachments = await save_ticket_files(files, ticket["organization_id"], str(ticket_id))
    now = datetime.now(UTC)
    await db.support_tickets.update_one(
        query,
        {
            "$push": {
                "messages": {
                    "sender_type": "ADMIN",
                    "sender_user_id": str(admin.id),
                    "sender_name": admin.full_name,
                    "message": clean_message,
                    "created_at": now,
                    "attachments": attachments,
                }
            },
            "$set": {"status": "IN_PROGRESS", "updated_at": now},
            "$inc": {"customer_unread_count": 1},
        },
    )
    item = await db.support_tickets.find_one(query)
    names = await organization_names(db)
    return _ticket_response(item, names.get(item["organization_id"]))


@router.patch("/tickets/{ticket_id}/read", response_model=TicketResponse)
async def mark_admin_ticket_read(
    ticket_id: UUID,
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(ticket_id)}
    result = await db.support_tickets.update_one(query, {"$set": {"admin_unread_count": 0}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    item = await db.support_tickets.find_one(query)
    names = await organization_names(db)
    return _ticket_response(item, names.get(item["organization_id"]))


@router.get("/tickets/{ticket_id}/attachments/{attachment_id}")
async def admin_download_ticket_attachment(
    ticket_id: UUID,
    attachment_id: UUID,
    _: Any = Depends(get_super_admin),
    db: Any = Depends(get_mongo_db),
):
    ticket = await db.support_tickets.find_one({"_id": str(ticket_id)})
    if ticket is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    attachment = find_attachment(ticket, str(attachment_id))
    inline = attachment["mime_type"].startswith("image/")
    return FileResponse(
        attachment_path(attachment["storage_key"]),
        media_type=attachment["mime_type"],
        filename=attachment["original_name"],
        content_disposition_type="inline" if inline else "attachment",
    )


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
