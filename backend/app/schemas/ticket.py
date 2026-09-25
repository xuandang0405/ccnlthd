from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=5, max_length=5000)


class TicketReplyCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class TicketStatusUpdate(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_PROGRESS|RESOLVED|CLOSED)$")


class TicketAttachment(BaseModel):
    id: UUID
    original_name: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class TicketMessage(BaseModel):
    sender_type: str
    sender_user_id: UUID | None
    sender_name: str
    message: str
    created_at: datetime
    attachments: list[TicketAttachment] = Field(default_factory=list)


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    organization_name: str | None = None
    created_by_user_id: UUID | None = None
    created_by_email: str | None = None
    created_by_name: str | None = None
    subject: str
    status: str
    priority: str
    messages: list[TicketMessage]
    admin_unread_count: int = 0
    customer_unread_count: int = 0
    created_at: datetime
    updated_at: datetime
