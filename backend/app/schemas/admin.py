from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    tickets_unread: int = 0


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
    organization_accounts: list["AdminOrganizationAccount"] = []
    created_at: datetime


class AdminOrganizationAccount(BaseModel):
    id: UUID
    name: str
    free_remaining: int
    purchased_remaining: int
    chatbot_slots: int = 1
    chatbot_count: int = 0


class UserStateUpdate(BaseModel):
    is_active: bool | None = None
    is_super_admin: bool | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None


class AdminCreditAdjustment(BaseModel):
    amount: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=3, max_length=500)


class AdminUserCreditAdjustment(AdminCreditAdjustment):
    organization_id: UUID


class AdminSlotAdjustment(BaseModel):
    organization_id: UUID
    amount: int = Field(ge=-100, le=100)
    reason: str = Field(min_length=3, max_length=500)


class AdminChatbot(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    owner_emails: list[str] = []
    name: str
    public_id: UUID
    description: str | None = None
    greeting: str
    tone: str
    primary_color: str
    is_active: bool
    credit_balance: int = 0
    usage_count: int = 0
    created_at: datetime


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


class AdminAuditEvent(BaseModel):
    id: UUID
    actor_email: str
    action: str
    resource_type: str
    resource_id: str
    metadata_redacted: str | None = None
    created_at: datetime
