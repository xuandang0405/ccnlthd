from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.core.records import add_record, make_record
from app.models.entities import SupportTicket
from app.schemas.ticket import TicketCreate, TicketReplyCreate, TicketResponse
from app.services.ticket_attachments import attachment_path, find_attachment, save_ticket_files
from app.services.tickets import append_message, owned_ticket, ticket_response, ticket_responses

router = APIRouter(prefix="/tickets", tags=["Support Tickets"])


@router.get("", response_model=list[TicketResponse])
async def list_tickets(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    tickets = (
        await db.scalars(
            select(SupportTicket)
            .where(SupportTicket.organization_id == context.organization.id)
            .order_by(SupportTicket.updated_at.desc())
        )
    ).all()
    return await ticket_responses(db, tickets, {context.organization.id: context.organization.name})


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await add_record(
        db,
        SupportTicket,
        make_record(
            organization_id=context.organization.id,
            created_by_user_id=context.user.id,
            created_by_email=context.user.email,
            created_by_name=context.user.full_name,
            subject=payload.subject.strip(),
            status="OPEN",
            priority="NORMAL",
            admin_unread_count=0,
            customer_unread_count=0,
        ),
    )
    await append_message(db, ticket, context.user, "CUSTOMER", payload.message)
    return await ticket_response(db, ticket, context.organization.name)


@router.post("/{ticket_id}/replies", response_model=TicketResponse)
async def customer_reply(
    ticket_id: UUID,
    payload: TicketReplyCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), context.organization.id)
    await append_message(db, ticket, context.user, "CUSTOMER", payload.message)
    return await ticket_response(db, ticket, context.organization.name)


@router.post("/{ticket_id}/attachments", response_model=TicketResponse)
async def customer_attachment(
    ticket_id: UUID,
    files: list[UploadFile] = File(),
    message: str = Form(default=""),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), context.organization.id)
    if len(message.strip()) > 5000:
        raise HTTPException(status_code=422, detail="Tin nhắn tối đa 5000 ký tự")
    attachments = await save_ticket_files(files, context.organization.id, str(ticket_id))
    await append_message(db, ticket, context.user, "CUSTOMER", message, attachments)
    return await ticket_response(db, ticket, context.organization.name)


@router.patch("/{ticket_id}/read", response_model=TicketResponse)
async def mark_customer_read(
    ticket_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), context.organization.id, lock=True)
    ticket.customer_unread_count = 0
    await db.flush()
    return await ticket_response(db, ticket, context.organization.name)


@router.get("/{ticket_id}/attachments/{attachment_id}")
async def customer_download_attachment(
    ticket_id: UUID,
    attachment_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    ticket = await owned_ticket(db, str(ticket_id), context.organization.id)
    attachment = find_attachment(await ticket_response(db, ticket), str(attachment_id))
    return FileResponse(
        attachment_path(attachment["storage_key"]),
        media_type=attachment["mime_type"],
        filename=attachment["original_name"],
        content_disposition_type="inline"
        if attachment["mime_type"].startswith("image/")
        else "attachment",
    )
