from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import MongoRecord, get_mongo_db, new_document, record
from app.models.entities import DocumentStatus
from app.schemas.chatbot import (
    ChatbotCreate,
    ChatbotCreditAllocation,
    ChatbotResponse,
    ChatbotUpdate,
)
from app.services.credits import ensure_credit_account, ensure_organization_limits
from app.services.document_links import link_chatbot_to_documents

router = APIRouter(prefix="/chatbots", tags=["Chatbots"])


@router.get("", response_model=list[ChatbotResponse])
async def list_chatbots(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    documents = (
        await db.chatbots.find({"organization_id": str(context.organization.id)})
        .sort("created_at", -1)
        .to_list(None)
    )
    return [record(document) for document in documents]


@router.post("", response_model=ChatbotResponse, status_code=201)
async def create_chatbot(
    payload: ChatbotCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    organization_id = str(context.organization.id)
    limits = await ensure_organization_limits(db, organization_id)
    chatbot_count = await db.chatbots.count_documents({"organization_id": organization_id})
    if chatbot_count >= int(limits["chatbot_slots"]):
        raise HTTPException(
            status_code=402,
            detail="Gói miễn phí chỉ có 1 chatbot. Vui lòng mua thêm vị trí chatbot.",
        )
    document = new_document(
        organization_id=organization_id,
        public_id=str(uuid4()),
        **payload.model_dump(),
        avatar_url=None,
        allowed_domains="[]",
        is_active=True,
        credit_balance=0,
        usage_count=0,
    )
    await db.chatbots.insert_one(document)
    await link_chatbot_to_documents(
        db,
        organization_id=str(context.organization.id),
        chatbot_id=document["_id"],
    )
    return record(document)


@router.post("/{chatbot_id}/credits", response_model=ChatbotResponse)
async def allocate_chatbot_credits(
    chatbot_id: UUID,
    payload: ChatbotCreditAllocation,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    organization_id = str(context.organization.id)
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    account = await ensure_credit_account(db, organization_id)
    amount = payload.amount
    if amount > 0 and int(account.get("purchased_remaining", 0)) < amount:
        raise HTTPException(status_code=409, detail="Ví chung không đủ lượt để phân bổ")
    if amount < 0 and int(chatbot.get("credit_balance", 0)) < abs(amount):
        raise HTTPException(status_code=409, detail="Chatbot không đủ lượt để thu hồi")
    now = datetime.now(UTC)
    async with db.client.start_session() as mongo_session:
        async with await mongo_session.start_transaction():
            wallet = await db.organization_credits.update_one(
                {
                    "organization_id": organization_id,
                    **({"purchased_remaining": {"$gte": amount}} if amount > 0 else {}),
                },
                {"$inc": {"purchased_remaining": -amount}, "$set": {"updated_at": now}},
                session=mongo_session,
            )
            updated = await db.chatbots.update_one(
                {
                    "_id": str(chatbot.id),
                    **({"credit_balance": {"$gte": abs(amount)}} if amount < 0 else {}),
                },
                {"$inc": {"credit_balance": amount}, "$set": {"updated_at": now}},
                session=mongo_session,
            )
            if not wallet.modified_count or not updated.modified_count:
                raise HTTPException(status_code=409, detail="Không thể cập nhật số lượt")
    return record(await db.chatbots.find_one({"_id": str(chatbot.id)}))


async def owned_chatbot(db: Any, chatbot_id: UUID, organization_id: str) -> MongoRecord:
    document = await db.chatbots.find_one(
        {"_id": str(chatbot_id), "organization_id": str(organization_id)}
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    return record(document)


@router.get("/{chatbot_id}", response_model=ChatbotResponse)
async def get_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    return await owned_chatbot(db, chatbot_id, context.organization.id)


@router.patch("/{chatbot_id}", response_model=ChatbotResponse)
async def update_chatbot(
    chatbot_id: UUID,
    payload: ChatbotUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    values = payload.model_dump(exclude_unset=True)
    values["updated_at"] = datetime.now(UTC)
    await db.chatbots.update_one({"_id": str(chatbot.id)}, {"$set": values})
    return record(await db.chatbots.find_one({"_id": str(chatbot.id)}))


@router.delete("/{chatbot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    chatbot_id_value = str(chatbot.id)
    organization_id = str(context.organization.id)
    await ensure_credit_account(db, organization_id)
    async with db.client.start_session() as session:
        async with await session.start_transaction():
            deleted = await db.chatbots.find_one_and_delete(
                {"_id": chatbot_id_value, "organization_id": organization_id},
                session=session,
            )
            if deleted is None:
                raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
            remaining = int(deleted.get("credit_balance", 0))
            if remaining:
                await db.organization_credits.update_one(
                    {"organization_id": organization_id},
                    {"$inc": {"purchased_remaining": remaining}},
                    session=session,
                )
            await db.chatbot_documents.delete_many(
                {"chatbot_id": chatbot_id_value}, session=session
            )


@router.put("/{chatbot_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_document(
    chatbot_id: UUID,
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    document = await db.documents.find_one(
        {
            "_id": str(document_id),
            "organization_id": str(context.organization.id),
            "status": DocumentStatus.DONE.value,
            "approval_status": "APPROVED",
        }
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Tài liệu chưa sẵn sàng hoặc không tồn tại")
    relation = new_document(
        organization_id=str(context.organization.id),
        chatbot_id=str(chatbot.id),
        document_id=document["_id"],
    )
    try:
        await db.chatbot_documents.insert_one(relation)
    except DuplicateKeyError:
        return None
