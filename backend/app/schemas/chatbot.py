from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ChatbotCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    greeting: str = Field(default="Xin chào! Tôi có thể giúp gì cho bạn?", max_length=500)
    tone: str = Field(default="professional", pattern="^(professional|friendly|concise)$")
    primary_color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name", "greeting")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Giá trị không được để trống")
        return value


class ChatbotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    greeting: str | None = Field(default=None, min_length=1, max_length=500)
    tone: str | None = Field(default=None, pattern="^(professional|friendly|concise)$")
    primary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    is_active: bool | None = None


class ChatbotResponse(BaseModel):
    id: UUID
    public_id: UUID
    name: str
    description: str | None
    greeting: str
    tone: str
    primary_color: str
    is_active: bool
    credit_balance: int = 0
    usage_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatbotCreditAllocation(BaseModel):
    amount: int = Field(ge=-1_000_000, le=1_000_000)

    @field_validator("amount")
    @classmethod
    def non_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("Số lượt phải khác 0")
        return value
