from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import PaymentStatus


class PaymentOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_code: str
    amount: int
    status: PaymentStatus
    expires_at: datetime | None
    bank_code: str
    account_number: str
    account_name: str
    transfer_content: str
    qr_code_url: str


class PaymentOrderStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_code: str
    amount: int
    status: PaymentStatus
    expires_at: datetime | None


class SePayWebhookPayload(BaseModel):
    id: int | str
    gateway: str
    transactionDate: str
    accountNumber: str
    subAccount: str | None = None
    code: str | None = None
    content: str | None = None
    transferType: str
    description: str | None = None
    transferAmount: int = Field(gt=0)
    accumulated: int | None = None
    referenceCode: str | None = None


class WebhookAcknowledgement(BaseModel):
    success: bool = True


class PublicPlanResponse(BaseModel):
    code: str
    display_name: str
    daily_chat_limit: int | None
    price_vnd: int | None
