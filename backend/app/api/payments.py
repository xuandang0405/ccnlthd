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
from pymongo.errors import DuplicateKeyError

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import get_settings
from app.core.mongodb import get_mongo_db, new_document, record
from app.core.security import ensure_utc
from app.models.entities import MemberRole, PaymentStatus
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
async def public_plans(db: Any = Depends(get_mongo_db)):
    plans = await db.plans.find({"is_active": True}).to_list(None)
    by_code = {plan["code"]: plan for plan in plans}
    free = by_code.get("FREE", {})
    pro = by_code.get("PRO", {})
    settings = get_settings()
    return [
        PublicPlanResponse(
            code="FREE",
            display_name=free.get("display_name", "Miễn phí"),
            daily_chat_limit=free.get("daily_chat_limit", 20),
            price_vnd=0,
        ),
        PublicPlanResponse(
            code="PRO",
            display_name=pro.get("display_name", "Pro"),
            daily_chat_limit=None,
            price_vnd=pro.get("price_vnd") or settings.payment_pro_plan_amount,
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
    "/payments/orders/pro", response_model=PaymentOrderResponse, status_code=status.HTTP_201_CREATED
)
async def create_pro_order(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    require_owner(context)
    settings = payment_config()
    now = datetime.now(UTC)
    plan = await db.plans.find_one({"code": "PRO"})
    if plan is None:
        plan = new_document(
            code="PRO",
            display_name="Pro",
            daily_chat_limit=None,
            price_vnd=settings.payment_pro_plan_amount,
            is_active=True,
        )
        await db.plans.insert_one(plan)
    else:
        await db.plans.update_one(
            {"_id": plan["_id"]},
            {"$set": {"price_vnd": settings.payment_pro_plan_amount, "updated_at": now}},
        )
    order = new_document(
        organization_id=str(context.organization.id),
        plan_id=plan["_id"],
        order_code=f"PRO-{secrets.token_hex(6).upper()}",
        amount=settings.payment_pro_plan_amount,
        status=PaymentStatus.PENDING.value,
        expires_at=now + timedelta(minutes=30),
    )
    await db.payment_orders.insert_one(order)
    await db.audit_logs.insert_one(
        new_document(
            organization_id=str(context.organization.id),
            actor_user_id=str(context.user.id),
            action="PAYMENT_ORDER_CREATED",
            resource_type="payment_order",
            resource_id=order["_id"],
            metadata_redacted=None,
        )
    )
    wrapped = record(order)
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
    )


@router.get("/payments/orders/{order_id}", response_model=PaymentOrderStatusResponse)
async def get_order(
    order_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    query = {"_id": str(order_id), "organization_id": str(context.organization.id)}
    order = await db.payment_orders.find_one(query)
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    if (
        order["status"] == PaymentStatus.PENDING.value
        and order.get("expires_at")
        and ensure_utc(order["expires_at"]) <= datetime.now(UTC)
    ):
        order["status"] = PaymentStatus.EXPIRED.value
        await db.payment_orders.update_one(
            query, {"$set": {"status": order["status"], "updated_at": datetime.now(UTC)}}
        )
    return record(order)


async def authenticate_sepay(
    request: Request, authorization: str | None, signature: str | None, timestamp: str | None
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
    db: Any = Depends(get_mongo_db),
):
    await authenticate_sepay(request, authorization, x_sepay_signature, x_sepay_timestamp)
    provider_id = str(payload.id)
    order_code = extract_order_code(payload)
    if order_code is None:
        return WebhookAcknowledgement()
    order = await db.payment_orders.find_one({"order_code": order_code})
    if order is None:
        return WebhookAcknowledgement()
    settings = get_settings()
    now = datetime.now(UTC)
    valid = (
        payload.transferType.lower() == "in"
        and payload.accountNumber == settings.payment_account_number
        and payload.transferAmount == order["amount"]
        and order["status"] == PaymentStatus.PENDING.value
        and (not order.get("expires_at") or ensure_utc(order["expires_at"]) > now)
    )
    tx_status = PaymentStatus.SUCCESS.value if valid else PaymentStatus.REVIEW.value
    transaction = new_document(
        organization_id=order["organization_id"],
        payment_order_id=order["_id"],
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
        async with db.client.start_session() as mongo_session:
            async with await mongo_session.start_transaction():
                await db.transactions.insert_one(transaction, session=mongo_session)
                if not valid:
                    return WebhookAcknowledgement()
                updated = await db.payment_orders.update_one(
                    {"_id": order["_id"], "status": PaymentStatus.PENDING.value},
                    {"$set": {"status": PaymentStatus.SUCCESS.value, "updated_at": now}},
                    session=mongo_session,
                )
                if not updated.modified_count:
                    await db.transactions.update_one(
                        {"_id": transaction["_id"]},
                        {"$set": {"status": PaymentStatus.REVIEW.value}},
                        session=mongo_session,
                    )
                    return WebhookAcknowledgement()
                current_pro = await db.subscriptions.find_one(
                    {
                        "organization_id": order["organization_id"],
                        "is_active": True,
                        "$or": [{"ends_at": None}, {"ends_at": {"$gt": now}}],
                    },
                    sort=[("ends_at", -1)],
                    session=mongo_session,
                )
                renewal_base = now
                if current_pro and current_pro.get("ends_at"):
                    renewal_base = max(now, ensure_utc(current_pro["ends_at"]))
                await db.subscriptions.update_many(
                    {"organization_id": order["organization_id"], "is_active": True},
                    {"$set": {"is_active": False, "updated_at": now}},
                    session=mongo_session,
                )
                await db.subscriptions.insert_one(
                    new_document(
                        organization_id=order["organization_id"],
                        plan_id=order["plan_id"],
                        is_active=True,
                        starts_at=now,
                        ends_at=renewal_base + timedelta(days=30),
                    ),
                    session=mongo_session,
                )
                await db.audit_logs.insert_one(
                    new_document(
                        organization_id=order["organization_id"],
                        actor_user_id=None,
                        action="PAYMENT_CONFIRMED_SUBSCRIPTION_ACTIVATED",
                        resource_type="payment_order",
                        resource_id=order["_id"],
                        metadata_redacted=json.dumps({"provider_transaction_id": provider_id}),
                    ),
                    session=mongo_session,
                )
    except DuplicateKeyError:
        return WebhookAcknowledgement()
    return WebhookAcknowledgement()
