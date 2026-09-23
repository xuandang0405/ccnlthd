from typing import Any

from app.core.mongodb import new_document
from app.models.entities import DocumentStatus


async def link_document_to_chatbots(
    db: Any, *, organization_id: str, document_id: str
) -> int:
    chatbots = await db.chatbots.find(
        {"organization_id": organization_id}, {"_id": 1}
    ).to_list(None)
    linked = 0
    for chatbot in chatbots:
        relation = new_document(
            organization_id=organization_id,
            chatbot_id=chatbot["_id"],
            document_id=document_id,
        )
        result = await db.chatbot_documents.update_one(
            {"chatbot_id": chatbot["_id"], "document_id": document_id},
            {"$setOnInsert": relation},
            upsert=True,
        )
        linked += int(result.upserted_id is not None)
    return linked


async def link_chatbot_to_documents(
    db: Any, *, organization_id: str, chatbot_id: str
) -> int:
    documents = await db.documents.find(
        {
            "organization_id": organization_id,
            "status": DocumentStatus.DONE.value,
        },
        {"_id": 1},
    ).to_list(None)
    linked = 0
    for document in documents:
        relation = new_document(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            document_id=document["_id"],
        )
        result = await db.chatbot_documents.update_one(
            {"chatbot_id": chatbot_id, "document_id": document["_id"]},
            {"$setOnInsert": relation},
            upsert=True,
        )
        linked += int(result.upserted_id is not None)
    return linked


async def backfill_document_links(db: Any) -> int:
    documents = await db.documents.find(
        {"status": DocumentStatus.DONE.value}, {"_id": 1, "organization_id": 1}
    ).to_list(None)
    linked = 0
    for document in documents:
        linked += await link_document_to_chatbots(
            db,
            organization_id=document["organization_id"],
            document_id=document["_id"],
        )
    return linked
