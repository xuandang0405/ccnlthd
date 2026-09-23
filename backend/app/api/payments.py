import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import quote, urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import ensure_utc
from app.models.entities import (
    AuditLog,
    MemberRole,
    PaymentOrder,
    PaymentStatus,
    Plan,
    Subscription,
    Transaction,
)
from app.schemas.payment import (
    PaymentOrderResponse,
    PaymentOrderStatusResponse,
    PublicPlanResponse,
    SePayWebhookPayload,
    WebhookAcknowledgement,
)

router = APIRouter(tags=["Payments"])
ORDER_PATTERN = re.compile(r"\bPRO-[A-Z0-9]{12}\b", re.IGNORECASE)


@router.get("/public/plans", response_model=list[PublicPlanResponse])
async def public_plans(db: AsyncSession = Depends(get_db)):
    plans = list((await db.scalars(select(Plan).where(Plan.is_active.is_(True)))).all())
    by_code = {plan.code: plan for plan in plans}
    free = by_code.get("FREE")
    pro = by_code.get("PRO")
    settings = get_settings()
    return [
        PublicPlanResponse(
            code="FREE",
            display_name=free.display_name if free else "Miễn phí",
            daily_chat_limit=free.daily_chat_limit if free else 20,
            price_vnd=0,
        ),
        PublicPlanResponse(
            code="PRO",
            display_name=pro.display_name if pro else "Pro",
            daily_chat_limit=None,
            price_vnd=pro.price_vnd if pro else settings.payment_pro_plan_amount,
        ),
    ]


def payment_config():
    settings = get_settings()
    required = {
        "PAYMENT_BANK_CODE": settings.payment_bank_code,
        "PAYMENT_BANK_BIN": settings.payment_bank_bin,
        "PAYMENT_ACCOUNT_NUMBER": settings.payment_account_number,
        "PAYMENT_ACCOUNT_NAME": settings.payment_account_name,
        "PAYMENT_PRO_PLAN_AMOUNT": settings.payment_pro_plan_amount,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Thanh toán chưa được cấu hình: {', '.join(missing)}",
        )
    return settings


def require_owner(context: TenantContext) -> None:
    if context.membership.role != MemberRole.BUSINESS_OWNER:
        raise HTTPException(
            status_code=403, detail="Chỉ chủ doanh nghiệp có thể quản lý thanh toán"
        )


def vietqr_url(settings, order: PaymentOrder) -> str:
    bank_id = quote(settings.payment_bank_bin, safe="")
    account_number = quote(settings.payment_account_number, safe="")
    query = urlencode(
        {
            "amount": order.amount,
            "addInfo": order.order_code,
            "accountName": settings.payment_account_name,
        }
    )
    return (
        f"https://img.vietqr.io/image/{bank_id}-{account_number}-compact2.png?{query}"
    )


@router.post(
    "/payments/orders/pro", response_model=PaymentOrderResponse, status_code=status.HTTP_201_CREATED
)
async def create_pro_order(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    require_owner(context)
    settings = payment_config()
    plan = await db.scalar(select(Plan).where(Plan.code == "PRO"))
    if plan is None:
        plan = Plan(
            code="PRO",
            display_name="Pro",
            daily_chat_limit=None,
            price_vnd=settings.payment_pro_plan_amount,
        )
        db.add(plan)
        await db.flush()
    else:
        plan.price_vnd = settings.payment_pro_plan_amount

    order = PaymentOrder(
        organization_id=context.organization.id,
        plan_id=plan.id,
        order_code=f"PRO-{secrets.token_hex(6).upper()}",
        amount=settings.payment_pro_plan_amount,
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    db.add(order)
    await db.flush()
    db.add(
        AuditLog(
            organization_id=context.organization.id,
            actor_user_id=context.user.id,
            action="PAYMENT_ORDER_CREATED",
            resource_type="payment_order",
            resource_id=str(order.id),
        )
    )
    return PaymentOrderResponse(
        id=order.id,
        order_code=order.order_code,
        amount=order.amount,
        status=order.status,
        expires_at=order.expires_at,
        bank_code=settings.payment_bank_code,
        account_number=settings.payment_account_number,
        account_name=settings.payment_account_name,
        transfer_content=order.order_code,
        qr_code_url=vietqr_url(settings, order),
    )


@router.get("/payments/orders/{order_id}", response_model=PaymentOrderStatusResponse)
async def get_order(
    order_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    order = await db.scalar(
        select(PaymentOrder).where(
            PaymentOrder.id == order_id,
            PaymentOrder.organization_id == context.organization.id,
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    if (
        order.status == PaymentStatus.PENDING
        and order.expires_at
        and ensure_utc(order.expires_at) <= datetime.now(UTC)
    ):
        order.status = PaymentStatus.EXPIRED
    return order


async def authenticate_sepay(
    request: Request,
    authorization: str | None,
    signature: str | None,
    timestamp: str | None,
) -> None:
    settings = get_settings()
    mode = (settings.sepay_auth_mode or "").upper()
    if mode == "API_KEY" and settings.sepay_api_key is not None:
        expected = f"Apikey {settings.sepay_api_key.get_secret_value()}"
        if authorization and secrets.compare_digest(authorization, expected):
            return
        raise HTTPException(status_code=401, detail="Webhook không được xác thực")
    if mode in {"HMAC", "HMAC_SHA256", "HMAC-SHA256"} and settings.sepay_webhook_secret:
        if not signature or not timestamp:
            raise HTTPException(status_code=401, detail="Thiếu chữ ký webhook SePay")
        try:
            signed_at = int(timestamp)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Timestamp webhook không hợp lệ") from exc
        if abs(int(time.time()) - signed_at) > settings.sepay_hmac_tolerance_seconds:
            raise HTTPException(status_code=401, detail="Webhook đã quá thời hạn xác thực")
        raw_body = await request.body()
        signed_payload = timestamp.encode() + b"." + raw_body
        digest = hmac.new(
            settings.sepay_webhook_secret.get_secret_value().encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        expected = f"sha256={digest}"
        if secrets.compare_digest(signature, expected):
            return
        raise HTTPException(status_code=401, detail="Chữ ký webhook không hợp lệ")
    raise HTTPException(status_code=503, detail="Webhook SePay chưa được cấu hình an toàn")


def extract_order_code(payload: SePayWebhookPayload) -> str | None:
    for candidate in (payload.code, payload.content, payload.description):
        match = ORDER_PATTERN.search(candidate or "")
        if match:
            return match.group(0).upper()
    return None


@router.post("/webhooks/sepay", response_model=WebhookAcknowledgement)
@router.post("/payment/seepay-webhook", response_model=WebhookAcknowledgement)
async def sepay_webhook(
    request: Request,
    payload: SePayWebhookPayload,
    authorization: Annotated[str | None, Header()] = None,
    x_sepay_signature: Annotated[str | None, Header()] = None,
    x_sepay_timestamp: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
    await authenticate_sepay(
        request,
        authorization,
        x_sepay_signature,
        x_sepay_timestamp,
    )
    provider_id = str(payload.id)
    if await db.scalar(
        select(Transaction.id).where(
            Transaction.provider == "SEPAY",
            Transaction.provider_transaction_id == provider_id,
        )
    ):
        return WebhookAcknowledgement()

    order_code = extract_order_code(payload)
    if order_code is None:
        return WebhookAcknowledgement()

    order = await db.scalar(
        select(PaymentOrder).where(PaymentOrder.order_code == order_code).with_for_update()
    )
    if order is None:
        return WebhookAcknowledgement()

    settings = get_settings()
    valid = (
        payload.transferType.lower() == "in"
        and payload.accountNumber == settings.payment_account_number
        and payload.transferAmount == order.amount
        and order.status == PaymentStatus.PENDING
        and (order.expires_at is None or ensure_utc(order.expires_at) > datetime.now(UTC))
    )
    tx_status = PaymentStatus.SUCCESS if valid else PaymentStatus.REVIEW
    redacted = json.dumps(
        {
            "id": provider_id,
            "gateway": payload.gateway,
            "transactionDate": payload.transactionDate,
            "accountNumberSuffix": payload.accountNumber[-4:],
            "transferType": payload.transferType,
            "transferAmount": payload.transferAmount,
            "referenceCode": payload.referenceCode,
        },
        ensure_ascii=False,
    )
    values = {
        "organization_id": order.organization_id,
        "payment_order_id": order.id,
        "provider": "SEPAY",
        "provider_transaction_id": provider_id,
        "amount": payload.transferAmount,
        "status": tx_status,
        "raw_payload_redacted": redacted,
    }
    dialect_name = db.bind.dialect.name if db.bind is not None else "postgresql"
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert
    transaction_id = await db.scalar(
        insert_factory(Transaction)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["provider", "provider_transaction_id"])
        .returning(Transaction.id)
    )
    if transaction_id is None:
        return WebhookAcknowledgement()

    if valid:
        order.status = PaymentStatus.SUCCESS
        now = datetime.now(UTC)
        current_pro = await db.scalar(
            select(Subscription)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(
                Subscription.organization_id == order.organization_id,
                Subscription.is_active.is_(True),
                Plan.code == "PRO",
            )
            .order_by(Subscription.ends_at.desc())
            .limit(1)
        )
        renewal_base = now
        if current_pro and current_pro.ends_at and ensure_utc(current_pro.ends_at) > now:
            renewal_base = ensure_utc(current_pro.ends_at)
        await db.execute(
            update(Subscription)
            .where(
                Subscription.organization_id == order.organization_id,
                Subscription.is_active.is_(True),
            )
            .values(is_active=False)
        )
        db.add(
            Subscription(
                organization_id=order.organization_id,
                plan_id=order.plan_id,
                starts_at=now,
                ends_at=renewal_base + timedelta(days=30),
            )
        )
        db.add(
            AuditLog(
                organization_id=order.organization_id,
                action="PAYMENT_CONFIRMED_SUBSCRIPTION_ACTIVATED",
                resource_type="payment_order",
                resource_id=str(order.id),
                metadata_redacted=json.dumps({"provider_transaction_id": provider_id}),
            )
        )
    return WebhookAcknowledgement()
