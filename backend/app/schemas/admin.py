from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminSummary(BaseModel):
    organizations: int
    users: int
    chatbots: int
    conversations: int
    leads: int
    documents_processing: int
    payments_pending: int
    documents_pending_review: int = 0
    tickets_open: int = 0


class AdminOrganization(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime


class OrganizationStateUpdate(BaseModel):
    is_active: bool


class AdminUser(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    is_super_admin: bool
    organizations: list[str]
    created_at: datetime


class UserStateUpdate(BaseModel):
    is_active: bool


class AdminChatbot(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    name: str
    public_id: UUID
    is_active: bool
    credit_balance: int = 0
    usage_count: int = 0
    created_at: datetime


class ChatbotStateUpdate(BaseModel):
    is_active: bool


class AdminDocument(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    original_name: str
    status: str
    approval_status: str = "PENDING"
    approval_note: str | None = None
    ai_review: dict | None = None
    size_bytes: int
    created_at: datetime


class DocumentApprovalUpdate(BaseModel):
    approval_status: str = Field(pattern="^(APPROVED|REJECTED|PENDING)$")
    note: str | None = Field(default=None, max_length=1000)


class ModerationSettings(BaseModel):
    auto_review: bool


class AdminPayment(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    order_code: str
    product_name: str = "Đơn hàng cũ"
    amount: int
    status: str
    created_at: datetime
