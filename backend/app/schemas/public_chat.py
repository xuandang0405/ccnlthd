from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class VisitorSessionResponse(BaseModel):
    visitor_token: str
    conversation_id: UUID
    greeting: str
    primary_color: str
    expires_at: datetime


class PublicChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    client_message_id: UUID = Field(default_factory=uuid4)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tin nhắn không được để trống")
        return value


class SourceReference(BaseModel):
    document_id: UUID
    document_name: str


class PublicChatResponse(BaseModel):
    reply: str
    conversation_id: UUID
    remaining_daily: int | None
    remaining_credits: int
    reset_at: datetime | None = None
    sources: list[SourceReference]
