"""API quản trị hội thoại hỗ trợ và tệp đính kèm của ticket."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_common import organization_names
from app.api.deps import get_super_admin
from app.core.database import get_db
from app.models.entities import SupportTicket, User
from app.schemas.ticket import TicketReplyCreate, TicketResponse, TicketStatusUpdate
from app.services.ticket_attachments import attachment_path, find_attachment, save_ticket_files
from app.services.tickets import append_message, owned_ticket, ticket_response, ticket_responses

router = APIRouter()


@router.get("/tickets", response_model=list[TicketResponse])
async def all_tickets(
    _: User = Depends(get_super_admin), db: AsyncSession = Depends(get_db, scope="function")
):
    tickets = (
        await db.scalars(select(SupportTicket).order_by(SupportTicket.updated_at.desc()).limit(500))
    ).all()
    return await ticket_responses(db, tickets, await organization_names(db))


@router.post("/tickets/{ticket_id}/replies", response_model=TicketResponse)
async def admin_ticket_reply(
    ticket_id: UUID,
    payload: TicketReplyCreate,
    admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id))
    await append_message(db, ticket, admin, "ADMIN", payload.message)
    names = await organization_names(db)
    return await ticket_response(db, ticket, names.get(ticket.organization_id))


@router.post("/tickets/{ticket_id}/attachments", response_model=TicketResponse)
async def admin_ticket_attachment(
    ticket_id: UUID,
    files: list[UploadFile] = File(),
    message: str = Form(default=""),
    admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id))
    if len(message.strip()) > 5000:
        raise HTTPException(status_code=422, detail="Tin nhắn tối đa 5000 ký tự")
    attachments = await save_ticket_files(files, ticket.organization_id, str(ticket_id))
    await append_message(db, ticket, admin, "ADMIN", message, attachments)
    names = await organization_names(db)
    return await ticket_response(db, ticket, names.get(ticket.organization_id))


@router.patch("/tickets/{ticket_id}/read", response_model=TicketResponse)
async def mark_admin_ticket_read(
    ticket_id: UUID,
    _: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), lock=True)
    ticket.admin_unread_count = 0
    await db.flush()
    names = await organization_names(db)
    return await ticket_response(db, ticket, names.get(ticket.organization_id))


@router.get("/tickets/{ticket_id}/attachments/{attachment_id}")
async def admin_download_ticket_attachment(
    ticket_id: UUID,
    attachment_id: UUID,
    _: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id))
    attachment = find_attachment(await ticket_response(db, ticket), str(attachment_id))
    return FileResponse(
        attachment_path(attachment["storage_key"]),
        media_type=attachment["mime_type"],
        filename=attachment["original_name"],
        content_disposition_type="inline"
        if attachment["mime_type"].startswith("image/")
        else "attachment",
    )


@router.patch("/tickets/{ticket_id}/status", response_model=TicketResponse)
async def update_ticket_status(
    ticket_id: UUID,
    payload: TicketStatusUpdate,
    _: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), lock=True)
    ticket.status = payload.status
    await db.flush()
    names = await organization_names(db)
    return await ticket_response(db, ticket, names.get(ticket.organization_id))
