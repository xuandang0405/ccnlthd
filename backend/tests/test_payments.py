import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlparse

from pydantic import SecretStr

from app.core.config import get_settings
from app.core.mongodb import get_mongo_database
from tests.test_auth_and_tenants import register


async def test_sepay_webhook_is_authenticated_idempotent_and_grants_credits(client):
    public_plans = await client.get("/api/v1/public/plans")
    assert public_plans.status_code == 200
    assert public_plans.json()[1]["price_vnd"] == 349999

    products = await client.get("/api/v1/payments/products")
    assert products.status_code == 200
    assert len(products.json()) == 11
    assert len([item for item in products.json() if item["product_type"] == "CHAT_CREDITS"]) == 10
    assert next(item for item in products.json() if item["code"] == "BOT1")["price_vnd"] == 200000

    tokens, me = await register(client, "pay@example.com", "Công ty Pay")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    created = await client.post("/api/v1/payments/orders/product/C100", headers=headers)
    assert created.status_code == 201, created.text
    order = created.json()
    assert order["amount"] == 49999
    assert order["quantity"] == 100
    assert order["account_number"] == "123456789"
    qr_url = urlparse(order["qr_code_url"])
    assert qr_url.scheme == "https"
    assert qr_url.netloc == "img.vietqr.io"
    assert qr_url.path == "/image/970422-123456789-compact2.png"
    assert parse_qs(qr_url.query)["amount"] == ["49999"]
    assert parse_qs(qr_url.query)["addInfo"] == [order["order_code"]]

    payload = {
        "id": 987654,
        "gateway": "Test Bank",
        "transactionDate": "2026-09-22 10:00:00",
        "accountNumber": "123456789",
        "code": order["order_code"],
        "content": f"Thanh toan {order['order_code']}",
        "transferType": "in",
        "transferAmount": 49999,
        "referenceCode": "REF-1",
    }
    rejected = await client.post("/api/v1/webhooks/sepay", json=payload)
    assert rejected.status_code == 401

    webhook_headers = {"Authorization": "Apikey test-sepay-key"}
    accepted = await client.post("/api/v1/webhooks/sepay", json=payload, headers=webhook_headers)
    assert accepted.status_code == 200, accepted.text
    duplicate = await client.post("/api/v1/webhooks/sepay", json=payload, headers=webhook_headers)
    assert duplicate.status_code == 200

    status_response = await client.get(f"/api/v1/payments/orders/{order['id']}", headers=headers)
    assert status_response.json()["status"] == "SUCCESS"

    db = get_mongo_database()
    assert await db.transactions.count_documents({}) == 1
    balance = await client.get("/api/v1/payments/balance", headers=headers)
    assert balance.status_code == 200
    assert balance.json()["free_remaining"] == 20
    assert balance.json()["purchased_remaining"] == 100


async def test_sepay_hmac_alias_verifies_raw_body(client):
    settings = get_settings()
    previous_mode = settings.sepay_auth_mode
    previous_secret = settings.sepay_webhook_secret
    settings.sepay_auth_mode = "HMAC_SHA256"
    settings.sepay_webhook_secret = SecretStr("test-hmac-secret")
    payload = {
        "id": 123456,
        "gateway": "Test Bank",
        "transactionDate": "2026-09-22 10:00:00",
        "accountNumber": "123456789",
        "content": "Khong co ma don hang",
        "transferType": "in",
        "transferAmount": 1000,
        "referenceCode": "REF-HMAC",
    }
    raw_body = json.dumps(payload, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = (
        "sha256="
        + hmac.new(
            b"test-hmac-secret", timestamp.encode() + b"." + raw_body, hashlib.sha256
        ).hexdigest()
    )
    try:
        response = await client.post(
            "/api/v1/payment/seepay-webhook",
            content=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-SePay-Signature": signature,
                "X-SePay-Timestamp": timestamp,
            },
        )
        assert response.status_code == 200, response.text
    finally:
        settings.sepay_auth_mode = previous_mode
        settings.sepay_webhook_secret = previous_secret
