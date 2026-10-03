from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.entities import LeadStatus, MessageRole


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: MessageRole
    content: str
    created_at: datetime


class ConversationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chatbot_id: UUID
    chatbot_name: str
    first_question: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationItem]
    total: int
    page: int
    page_size: int


class ConversationDetail(ConversationItem):
    messages: list[MessageResponse]


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chatbot_id: UUID
    conversation_id: UUID
    customer_name: str | None
    phone: str | None
    email: str | None
    intent_summary: str | None
    status: LeadStatus
    assigned_user_id: UUID | None
    created_at: datetime
    updated_at: datetime


class LeadPage(BaseModel):
    items: list[LeadResponse]
    total: int
    page: int
    page_size: int


class LeadStatusUpdate(BaseModel):
    status: LeadStatus


class PublicLeadCreate(BaseModel):
    customer_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, min_length=6, max_length=30)
    email: EmailStr | None = None
    intent_summary: str | None = Field(default=None, max_length=1000)
    source_message_id: UUID | None = None

    def has_contact(self) -> bool:
        return bool(self.phone or self.email)
