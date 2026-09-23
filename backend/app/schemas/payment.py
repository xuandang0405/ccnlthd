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
    product_code: str
    product_name: str
    product_type: str
    quantity: int


class PaymentOrderStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_code: str
    amount: int
    status: PaymentStatus
    expires_at: datetime | None
    product_code: str = "LEGACY"
    product_name: str = "Đơn hàng cũ"
    product_type: str = "LEGACY"
    quantity: int = 0


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


class PaymentProductResponse(BaseModel):
    code: str
    name: str
    description: str
    product_type: str
    quantity: int
    price_vnd: int


class CreditBalanceResponse(BaseModel):
    free_remaining: int
    purchased_remaining: int
    chatbot_slots: int
    chatbot_count: int
