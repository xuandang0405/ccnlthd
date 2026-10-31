import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import quote, urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.records import add_record, make_record
from app.core.security import ensure_utc
from app.models.entities import (
    AuditLog,
    Chatbot,
    MemberRole,
    OrganizationCredit,
    OrganizationLimit,
    PaymentOrder,
    PaymentStatus,
    Plan,
    Transaction,
)
from app.schemas.payment import (
    CreditBalanceResponse,
    PaymentOrderResponse,
    PaymentOrderStatusResponse,
    PaymentProductResponse,
    PublicPlanResponse,
    SePayWebhookPayload,
    WebhookAcknowledgement,
)
from app.services.commerce import PRODUCTS, PRODUCTS_BY_CODE
from app.services.credits import ensure_credit_account, ensure_organization_limits

router = APIRouter(tags=["Payments"])
PRODUCT_CODE_PATTERN = "|".join(
    re.escape(code) for code in sorted(PRODUCTS_BY_CODE, key=len, reverse=True)
)
ORDER_PATTERN = re.compile(
    rf"\b(?P<product>{PRODUCT_CODE_PATTERN})[-\s_.]?(?P<token>[A-Z0-9]{{12}})\b",
    re.IGNORECASE,
)


@router.get("/public/plans", response_model=list[PublicPlanResponse])
async def public_plans(db: AsyncSession = Depends(get_db, scope="function")):
    plans = (
        await db.scalars(
            select(Plan).where(Plan.is_active.is_(True)).execution_options(populate_existing=True)
        )
    ).all()
    by_code = {plan["code"]: plan for plan in plans}
    free = by_code.get("FREE", {})
    return [
        PublicPlanResponse(
            code="FREE",
            display_name=free.get("display_name", "Miễn phí"),
            daily_chat_limit=free.get("daily_chat_limit", 20),
            price_vnd=0,
        ),
        PublicPlanResponse(
            code="C1000",
            display_name="Gói 1.000 lượt",
            daily_chat_limit=None,
            price_vnd=PRODUCTS_BY_CODE["C1000"]["price_vnd"],
        ),
    ]


@router.get("/payments/products", response_model=list[PaymentProductResponse])
async def payment_products():
    return list(PRODUCTS)


@router.get("/payments/balance", response_model=CreditBalanceResponse)
async def credit_balance(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    organization_id = str(context.organization.id)
    account = await ensure_credit_account(db, organization_id)
    limits = await ensure_organization_limits(db, organization_id)
    return CreditBalanceResponse(
        free_remaining=int(account.get("free_remaining", 0)),
        purchased_remaining=int(account.get("purchased_remaining", 0)),
        chatbot_slots=int(limits.get("chatbot_slots", 1)),
        chatbot_count=await db.scalar(
            select(func.count())
            .select_from(Chatbot)
            .where(Chatbot.organization_id == organization_id)
        ),
    )


def payment_config():
    settings = get_settings()
    required = {
        "PAYMENT_BANK_CODE": settings.payment_bank_code,
        "PAYMENT_BANK_BIN": settings.payment_bank_bin,
        "PAYMENT_ACCOUNT_NUMBER": settings.payment_account_number,
        "PAYMENT_ACCOUNT_NAME": settings.payment_account_name,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise HTTPException(
            status_code=503, detail=f"Thanh toán chưa được cấu hình: {', '.join(missing)}"
        )
    return settings


def require_owner(context: TenantContext) -> None:
    if context.membership.role != MemberRole.BUSINESS_OWNER:
        raise HTTPException(
            status_code=403, detail="Chỉ chủ doanh nghiệp có thể quản lý thanh toán"
        )


def vietqr_url(settings: Any, order: Any) -> str:
    bank_id = quote(settings.payment_bank_bin, safe="")
    account_number = quote(settings.payment_account_number, safe="")
    query = urlencode(
        {
            "amount": order.amount,
            "addInfo": order.order_code,
            "accountName": settings.payment_account_name,
        }
    )
    return f"https://img.vietqr.io/image/{bank_id}-{account_number}-compact2.png?{query}"


@router.post(
    "/payments/orders/product/{product_code}",
    response_model=PaymentOrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_order(
    product_code: str,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    require_owner(context)
    settings = payment_config()
    product = PRODUCTS_BY_CODE.get(product_code.upper())
    if product is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy gói thanh toán")
    now = datetime.now(UTC)
    order = make_record(
        organization_id=str(context.organization.id),
        product_code=product["code"],
        product_name=product["name"],
        product_type=product["product_type"],
        quantity=product["quantity"],
        order_code=f"{product['code']}-{secrets.token_hex(6).upper()}",
        amount=product["price_vnd"],
        status=PaymentStatus.PENDING.value,
        expires_at=now + timedelta(minutes=30),
    )
    order = await add_record(db, PaymentOrder, order)
    await add_record(
        db,
        AuditLog,
        make_record(
            organization_id=str(context.organization.id),
            actor_user_id=str(context.user.id),
            action="PAYMENT_ORDER_CREATED",
            resource_type="payment_order",
            resource_id=order["id"],
            metadata_redacted=None,
        ),
    )
    wrapped = order
    return PaymentOrderResponse(
        id=wrapped.id,
        order_code=wrapped.order_code,
        amount=wrapped.amount,
        status=wrapped.status,
        expires_at=wrapped.expires_at,
        bank_code=settings.payment_bank_code,
        account_number=settings.payment_account_number,
        account_name=settings.payment_account_name,
        transfer_content=wrapped.order_code,
        qr_code_url=vietqr_url(settings, wrapped),
        product_code=wrapped.product_code,
        product_name=wrapped.product_name,
        product_type=wrapped.product_type,
        quantity=wrapped.quantity,
    )


@router.get("/payments/orders/{order_id}", response_model=PaymentOrderStatusResponse)
async def get_order(
    order_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    query = and_(
        PaymentOrder.id == str(order_id),
        PaymentOrder.organization_id == str(context.organization.id),
    )
    order = await db.scalar(
        select(PaymentOrder)
        .where(query)
        .with_for_update()
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    if (
        order["status"] == PaymentStatus.PENDING.value
        and order.get("expires_at")
        and ensure_utc(order["expires_at"]) <= datetime.now(UTC)
    ):
        order["status"] = PaymentStatus.EXPIRED.value
        await db.execute(
            update(PaymentOrder)
            .where(query)
            .values(**{**{"status": order["status"], "updated_at": datetime.now(UTC)}})
        )
    return order


async def authenticate_sepay(
    request: Request,
    authorization: str | None,
    signature: str | None,
    timestamp: str | None,
    settings: Settings,
) -> None:
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
        digest = hmac.new(
            settings.sepay_webhook_secret.get_secret_value().encode(),
            timestamp.encode() + b"." + raw_body,
            hashlib.sha256,
        ).hexdigest()
        if secrets.compare_digest(signature, f"sha256={digest}"):
            return
        raise HTTPException(status_code=401, detail="Chữ ký webhook không hợp lệ")
    raise HTTPException(status_code=503, detail="Webhook SePay chưa được cấu hình an toàn")


def extract_order_code(payload: SePayWebhookPayload) -> str | None:
    for candidate in (payload.code, payload.content, payload.description):
        match = ORDER_PATTERN.search(candidate or "")
        if match:
            return f"{match.group('product').upper()}-{match.group('token').upper()}"
    return None


@router.post("/webhooks/sepay", response_model=WebhookAcknowledgement)
@router.post("/payment/seepay-webhook", response_model=WebhookAcknowledgement)
async def sepay_webhook(
    request: Request,
    payload: SePayWebhookPayload,
    authorization: Annotated[str | None, Header()] = None,
    x_sepay_signature: Annotated[str | None, Header()] = None,
    x_sepay_timestamp: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db, scope="function"),
    settings: Settings = Depends(get_settings),
):
    await authenticate_sepay(request, authorization, x_sepay_signature, x_sepay_timestamp, settings)
    provider_id = str(payload.id)
    order_code = extract_order_code(payload)
    if order_code is None:
        return WebhookAcknowledgement()
    order = await db.scalar(
        select(PaymentOrder)
        .where(PaymentOrder.order_code == order_code)
        .with_for_update()
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if order is None:
        return WebhookAcknowledgement()
    now = datetime.now(UTC)
    valid = (
        payload.transferType.lower() == "in"
        and payload.accountNumber == settings.payment_account_number
        and payload.transferAmount == order["amount"]
        and order["status"] == PaymentStatus.PENDING.value
        and (not order.get("expires_at") or ensure_utc(order["expires_at"]) > now)
    )
    tx_status = PaymentStatus.SUCCESS.value if valid else PaymentStatus.REVIEW.value
    transaction = make_record(
        organization_id=order["organization_id"],
        payment_order_id=order["id"],
        provider="SEPAY",
        provider_transaction_id=provider_id,
        amount=payload.transferAmount,
        status=tx_status,
        raw_payload_redacted=json.dumps(
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
        ),
    )
    try:
        async with db.begin_nested():
            transaction = await add_record(db, Transaction, transaction)
            if not valid:
                return WebhookAcknowledgement()
            updated = await db.execute(
                update(PaymentOrder)
                .where(
                    and_(
                        PaymentOrder.id == order["id"],
                        PaymentOrder.status == PaymentStatus.PENDING.value,
                    )
                )
                .values(**{**{"status": PaymentStatus.SUCCESS.value, "updated_at": now}})
            )
            if not updated.rowcount:
                await db.execute(
                    update(Transaction)
                    .where(Transaction.id == transaction["id"])
                    .values(**{**{"status": PaymentStatus.REVIEW.value}})
                )
                return WebhookAcknowledgement()
            if order["product_type"] == "CHAT_CREDITS":
                account = await db.scalar(
                    select(OrganizationCredit)
                    .where(OrganizationCredit.organization_id == order["organization_id"])
                    .limit(1)
                    .execution_options(populate_existing=True)
                )
                if account is None:
                    await add_record(
                        db,
                        OrganizationCredit,
                        make_record(
                            organization_id=order["organization_id"],
                            free_remaining=20,
                            purchased_remaining=order["quantity"],
                        ),
                    )
                else:
                    await db.execute(
                        update(OrganizationCredit)
                        .where(OrganizationCredit.id == account["id"])
                        .values(
                            **{
                                **{"updated_at": now},
                                "purchased_remaining": OrganizationCredit.purchased_remaining
                                + order["quantity"],
                            }
                        )
                    )
            elif order["product_type"] == "CHATBOT_SLOT":
                limits = await db.scalar(
                    select(OrganizationLimit)
                    .where(OrganizationLimit.organization_id == order["organization_id"])
                    .limit(1)
                    .execution_options(populate_existing=True)
                )
                if limits is None:
                    await add_record(
                        db,
                        OrganizationLimit,
                        make_record(
                            organization_id=order["organization_id"],
                            chatbot_slots=1 + order["quantity"],
                        ),
                    )
                else:
                    await db.execute(
                        update(OrganizationLimit)
                        .where(OrganizationLimit.id == limits["id"])
                        .values(
                            **{
                                **{"updated_at": now},
                                "chatbot_slots": OrganizationLimit.chatbot_slots
                                + order["quantity"],
                            }
                        )
                    )
            await add_record(
                db,
                AuditLog,
                make_record(
                    organization_id=order["organization_id"],
                    actor_user_id=None,
                    action="PAYMENT_CONFIRMED_PRODUCT_GRANTED",
                    resource_type="payment_order",
                    resource_id=order["id"],
                    metadata_redacted=json.dumps(
                        {
                            "provider_transaction_id": provider_id,
                            "product_code": order["product_code"],
                        }
                    ),
                ),
            )
    except IntegrityError:
        return WebhookAcknowledgement()
    return WebhookAcknowledgement()
