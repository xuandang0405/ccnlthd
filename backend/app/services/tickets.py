"""Lưu ticket, tin nhắn và tệp thành các bảng riêng; giữ nguyên JSON trả về frontend."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.records import add_record, add_records, make_record
from app.models.entities import SupportTicket, SupportTicketAttachment, SupportTicketMessage, User


async def owned_ticket(
    db: AsyncSession, ticket_id: str, organization_id: str | None = None, *, lock: bool = False
) -> SupportTicket:
    query = select(SupportTicket).where(SupportTicket.id == ticket_id)
    if organization_id is not None:
        query = query.where(SupportTicket.organization_id == organization_id)
    if lock:
        query = query.with_for_update()
    ticket = await db.scalar(query.execution_options(populate_existing=True))
    if ticket is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
    return ticket


async def append_message(
    db: AsyncSession,
    ticket: SupportTicket,
    sender: User,
    sender_type: str,
    message: str,
    attachments: list[dict] | None = None,
) -> None:
    ticket = await owned_ticket(db, ticket.id, lock=True)
    item = await add_record(
        db,
        SupportTicketMessage,
        make_record(
            ticket_id=ticket.id,
            sender_type=sender_type,
            sender_user_id=sender.id,
            sender_name=sender.full_name,
            message=message.strip(),
        ),
    )
    if attachments:
        await add_records(
            db,
            SupportTicketAttachment,
            [make_record(**attachment, message_id=item.id) for attachment in attachments],
        )
    if sender_type == "ADMIN":
        ticket.status = "IN_PROGRESS"
        ticket.customer_unread_count += 1
    else:
        ticket.status = "OPEN"
        ticket.admin_unread_count += 1
    await db.flush()


async def ticket_responses(
    db: AsyncSession, tickets: list[SupportTicket], names: dict[str, str]
) -> list[dict]:
    ids = [ticket.id for ticket in tickets]
    messages = (
        await db.scalars(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id.in_(ids))
            .order_by(SupportTicketMessage.created_at, SupportTicketMessage.id)
        )
    ).all()
    attachments = (
        await db.scalars(
            select(SupportTicketAttachment)
            .where(SupportTicketAttachment.message_id.in_([message.id for message in messages]))
            .order_by(SupportTicketAttachment.created_at, SupportTicketAttachment.id)
        )
    ).all()
    files_by_message: dict[str, list[dict]] = {}
    for attachment in attachments:
        files_by_message.setdefault(attachment.message_id, []).append(attachment.as_dict())
    messages_by_ticket: dict[str, list[dict]] = {}
    for message in messages:
        messages_by_ticket.setdefault(message.ticket_id, []).append(
            {
                **message.as_dict(),
                "attachments": files_by_message.get(message.id, []),
            }
        )
    creators = (
        await db.scalars(
            select(User).where(User.id.in_([ticket.created_by_user_id for ticket in tickets]))
        )
    ).all()
    creators_by_id = {user.id: user for user in creators}
    results = []
    for ticket in tickets:
        creator = creators_by_id.get(ticket.created_by_user_id)
        results.append(
            {
                **ticket.as_dict(),
                "organization_name": names.get(ticket.organization_id),
                "created_by_email": ticket.created_by_email or (creator.email if creator else None),
                "created_by_name": ticket.created_by_name
                or (creator.full_name if creator else None),
                "messages": messages_by_ticket.get(ticket.id, []),
            }
        )
    return results


async def ticket_response(db: AsyncSession, ticket: SupportTicket, name: str | None = None) -> dict:
    return (await ticket_responses(db, [ticket], {ticket.organization_id: name}))[0]
