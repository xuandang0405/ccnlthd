from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import MongoRecord, get_mongo_db, new_document, record
from app.models.entities import DocumentStatus
from app.schemas.chatbot import ChatbotCreate, ChatbotResponse, ChatbotUpdate
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
    document = new_document(
        organization_id=str(context.organization.id),
        public_id=str(uuid4()),
        **payload.model_dump(),
        avatar_url=None,
        allowed_domains="[]",
        is_active=True,
    )
    await db.chatbots.insert_one(document)
    await link_chatbot_to_documents(
        db,
        organization_id=str(context.organization.id),
        chatbot_id=document["_id"],
    )
    return record(document)


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
    await db.chatbots.delete_one({"_id": chatbot_id_value})
    await db.chatbot_documents.delete_many({"chatbot_id": chatbot_id_value})


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
