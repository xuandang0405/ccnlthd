from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import get_mongo_db, new_document
from app.schemas.ticket import TicketCreate, TicketReplyCreate, TicketResponse
from app.services.ticket_attachments import (
    attachment_path,
    find_attachment,
    save_ticket_files,
)

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
        created_by_email=context.user.email,
        created_by_name=context.user.full_name,
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
                "attachments": [],
            }
        ],
        admin_unread_count=1,
        customer_unread_count=0,
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
                    "attachments": [],
                }
            },
            "$set": {"status": "OPEN", "updated_at": now},
            "$inc": {"admin_unread_count": 1},
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    return ticket_response(await db.support_tickets.find_one(query), context.organization.name)


@router.post("/{ticket_id}/attachments", response_model=TicketResponse)
async def customer_attachment(
    ticket_id: UUID,
    files: list[UploadFile] = File(),
    message: str = Form(default=""),
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(ticket_id), "organization_id": str(context.organization.id)}
    ticket = await db.support_tickets.find_one(query)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    clean_message = message.strip()
    if len(clean_message) > 5000:
        raise HTTPException(status_code=422, detail="Tin nhắn tối đa 5000 ký tự")
    attachments = await save_ticket_files(files, str(context.organization.id), str(ticket_id))
    now = datetime.now(UTC)
    await db.support_tickets.update_one(
        query,
        {
            "$push": {
                "messages": {
                    "sender_type": "CUSTOMER",
                    "sender_user_id": str(context.user.id),
                    "sender_name": context.user.full_name,
                    "message": clean_message,
                    "created_at": now,
                    "attachments": attachments,
                }
            },
            "$set": {"status": "OPEN", "updated_at": now},
            "$inc": {"admin_unread_count": 1},
        },
    )
    return ticket_response(await db.support_tickets.find_one(query), context.organization.name)


@router.patch("/{ticket_id}/read", response_model=TicketResponse)
async def mark_customer_read(
    ticket_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(ticket_id), "organization_id": str(context.organization.id)}
    result = await db.support_tickets.update_one(query, {"$set": {"customer_unread_count": 0}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    return ticket_response(await db.support_tickets.find_one(query), context.organization.name)


@router.get("/{ticket_id}/attachments/{attachment_id}")
async def customer_download_attachment(
    ticket_id: UUID,
    attachment_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    ticket = await db.support_tickets.find_one(
        {"_id": str(ticket_id), "organization_id": str(context.organization.id)}
    )
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
