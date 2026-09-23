from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import get_mongo_db, new_document
from app.schemas.ticket import TicketCreate, TicketReplyCreate, TicketResponse

router = APIRouter(prefix="/tickets", tags=["Support Tickets"])


def ticket_response(document: dict[str, Any], organization_name: str | None = None) -> dict:
    return {
        "id": document["_id"],
        **{k: v for k, v in document.items() if k != "_id"},
        "organization_name": organization_name,
    }


@router.get("", response_model=list[TicketResponse])
async def list_tickets(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    documents = (
        await db.support_tickets.find({"organization_id": str(context.organization.id)})
        .sort("updated_at", -1)
        .to_list(None)
    )
    return [ticket_response(item, context.organization.name) for item in documents]


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    now = datetime.now(UTC)
    document = new_document(
        organization_id=str(context.organization.id),
        created_by_user_id=str(context.user.id),
        subject=payload.subject.strip(),
        status="OPEN",
        priority="NORMAL",
        messages=[
            {
                "sender_type": "CUSTOMER",
                "sender_user_id": str(context.user.id),
                "sender_name": context.user.full_name,
                "message": payload.message.strip(),
                "created_at": now,
            }
        ],
    )
    await db.support_tickets.insert_one(document)
    return ticket_response(document, context.organization.name)


@router.post("/{ticket_id}/replies", response_model=TicketResponse)
async def customer_reply(
    ticket_id: UUID,
    payload: TicketReplyCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(ticket_id), "organization_id": str(context.organization.id)}
    now = datetime.now(UTC)
    result = await db.support_tickets.update_one(
        query,
        {
            "$push": {
                "messages": {
                    "sender_type": "CUSTOMER",
                    "sender_user_id": str(context.user.id),
                    "sender_name": context.user.full_name,
                    "message": payload.message.strip(),
                    "created_at": now,
                }
            },
            "$set": {"status": "OPEN", "updated_at": now},
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    return ticket_response(await db.support_tickets.find_one(query), context.organization.name)
