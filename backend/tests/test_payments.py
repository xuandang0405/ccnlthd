from uuid import UUID

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.entities import Plan, Subscription, Transaction
from tests.test_auth_and_tenants import register


async def test_sepay_webhook_is_authenticated_idempotent_and_activates_pro(client):
    public_plans = await client.get("/api/v1/public/plans")
    assert public_plans.status_code == 200
    assert public_plans.json()[1]["price_vnd"] == 199000

    tokens, me = await register(client, "pay@example.com", "Công ty Pay")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    created = await client.post("/api/v1/payments/orders/pro", headers=headers)
    assert created.status_code == 201, created.text
    order = created.json()
    assert order["amount"] == 199000
    assert order["account_number"] == "123456789"

    payload = {
        "id": 987654,
        "gateway": "Test Bank",
        "transactionDate": "2026-09-22 10:00:00",
        "accountNumber": "123456789",
        "code": order["order_code"],
        "content": f"Thanh toan {order['order_code']}",
        "transferType": "in",
        "transferAmount": 199000,
        "referenceCode": "REF-1",
    }
    rejected = await client.post("/api/v1/webhooks/sepay", json=payload)
    assert rejected.status_code == 401

    webhook_headers = {"Authorization": "Apikey test-sepay-key"}
    accepted = await client.post(
        "/api/v1/webhooks/sepay", json=payload, headers=webhook_headers
    )
    assert accepted.status_code == 200, accepted.text
    duplicate = await client.post(
        "/api/v1/webhooks/sepay", json=payload, headers=webhook_headers
    )
    assert duplicate.status_code == 200

    status_response = await client.get(
        f"/api/v1/payments/orders/{order['id']}", headers=headers
    )
    assert status_response.json()["status"] == "SUCCESS"

    async with SessionFactory() as db:
        transactions = (await db.scalars(select(Transaction))).all()
        assert len(transactions) == 1
        active_plan = await db.scalar(
            select(Plan)
            .join(Subscription, Subscription.plan_id == Plan.id)
            .where(
                Subscription.organization_id == UUID(organization_id),
                Subscription.is_active.is_(True),
            )
        )
        assert active_plan is not None
        assert active_plan.code == "PRO"
