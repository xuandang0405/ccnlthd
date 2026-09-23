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


class TicketMessage(BaseModel):
    sender_type: str
    sender_user_id: UUID | None
    sender_name: str
    message: str
    created_at: datetime


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    organization_name: str | None = None
    subject: str
    status: str
    priority: str
    messages: list[TicketMessage]
    created_at: datetime
    updated_at: datetime
