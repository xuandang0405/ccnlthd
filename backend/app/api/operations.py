import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import get_mongo_db, record
from app.models.entities import LeadStatus
from app.schemas.operations import (
    ConversationDetail,
    ConversationPage,
    LeadPage,
    LeadResponse,
    LeadStatusUpdate,
)

router = APIRouter(tags=["Operations"])


@router.get("/conversations", response_model=ConversationPage)
async def list_conversations(
    search: str | None = Query(default=None, max_length=100),
    chatbot_id: UUID | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query: dict[str, Any] = {"organization_id": str(context.organization.id)}
    if chatbot_id:
        query["chatbot_id"] = str(chatbot_id)
    if search:
        matching_messages = await db.messages.find(
            {
                "organization_id": str(context.organization.id),
                "content": {"$regex": re.escape(search.strip()), "$options": "i"},
            },
            {"conversation_id": 1},
        ).to_list(None)
        query["_id"] = {"$in": list({message["conversation_id"] for message in matching_messages})}
    if from_at or to_at:
        query["created_at"] = {}
        if from_at:
            query["created_at"]["$gte"] = from_at
        if to_at:
            query["created_at"]["$lte"] = to_at
    total = await db.conversations.count_documents(query)
    documents = (
        await db.conversations.find(query)
        .sort("updated_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(None)
    )
    return ConversationPage(
        items=[record(document) for document in documents],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    organization_id = str(context.organization.id)
    conversation = await db.conversations.find_one(
        {"_id": str(conversation_id), "organization_id": organization_id}
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    messages = (
        await db.messages.find(
            {"conversation_id": conversation["_id"], "organization_id": organization_id}
        )
        .sort("created_at", 1)
        .to_list(None)
    )
    return ConversationDetail.model_validate(
        {
            "id": conversation["_id"],
            **{key: value for key, value in conversation.items() if key != "_id"},
            "messages": [
                {"id": message["_id"], **{k: v for k, v in message.items() if k != "_id"}}
                for message in messages
            ],
        }
    )


@router.get("/leads", response_model=LeadPage)
async def list_leads(
    search: str | None = Query(default=None, max_length=100),
    lead_status: LeadStatus | None = Query(default=None, alias="status"),
    chatbot_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query: dict[str, Any] = {"organization_id": str(context.organization.id)}
    if lead_status:
        query["status"] = lead_status.value
    if chatbot_id:
        query["chatbot_id"] = str(chatbot_id)
    if search:
        expression = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {field: expression} for field in ("customer_name", "phone", "email", "intent_summary")
        ]
    total = await db.leads.count_documents(query)
    documents = (
        await db.leads.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(None)
    )
    return LeadPage(
        items=[record(document) for document in documents],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    payload: LeadStatusUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(lead_id), "organization_id": str(context.organization.id)}
    result = await db.leads.update_one(
        query, {"$set": {"status": payload.status.value, "updated_at": datetime.now(UTC)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy lead")
    return record(await db.leads.find_one(query))
