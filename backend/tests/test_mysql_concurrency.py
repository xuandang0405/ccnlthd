"""Kiểm tra khóa/giao dịch bằng các session thật riêng biệt, không dùng mock DB."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import func, select, update

from app.core.database import SessionFactory, engine, get_db
from app.core.redis import SQLRateLimitStore
from app.main import app
from app.models.entities import Chatbot, OrganizationCredit, RateLimitCounter, Transaction
from app.services.credits import CreditUnavailableError, consume_credit, refund_credit
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register

pytestmark = pytest.mark.skipif(engine.dialect.name != "mysql", reason="Cần MySQL để kiểm tra khóa")


@pytest_asyncio.fixture
async def independent_requests():
    previous_override = app.dependency_overrides[get_db]

    async def request_database():
        async with SessionFactory() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    app.dependency_overrides[get_db] = request_database
    try:
        yield
    finally:
        app.dependency_overrides[get_db] = previous_override


async def account_and_bot(client):
    tokens, me = await register(client, "concurrent@example.com", "Kiểm thử đồng thời")
    org_id = me["organizations"][0]["id"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}", "X-Organization-ID": org_id}
    response = await client.post("/api/v1/chatbots", headers=headers, json={"name": "Test bot"})
    assert response.status_code == 201, response.text
    return org_id, response.json()["id"], headers


async def test_concurrent_credit_use_and_refund_never_loses_credits(client, independent_requests):
    org_id, bot_id, _headers = await account_and_bot(client)
    async with SessionFactory.begin() as db:
        await db.execute(update(Chatbot).where(Chatbot.id == bot_id).values(credit_balance=3))

    async def consume():
        async with SessionFactory() as db:
            try:
                return await consume_credit(db, org_id, bot_id)
            except CreditUnavailableError:
                await db.rollback()
                return None

    results = await asyncio.gather(*(consume() for _ in range(30)))
    successful = [result for result in results if result is not None]
    assert len(successful) == 23
    async with SessionFactory() as db:
        bot = await db.get(Chatbot, bot_id)
        wallet = await db.scalar(
            select(OrganizationCredit).where(OrganizationCredit.organization_id == org_id)
        )
        assert (bot.credit_balance, bot.usage_count, wallet.free_remaining) == (0, 23, 0)

    async def refund(source):
        async with SessionFactory() as db:
            await refund_credit(db, org_id, bot_id, source)

    await asyncio.gather(*(refund(result.source) for result in successful))
    async with SessionFactory() as db:
        bot = await db.get(Chatbot, bot_id)
        wallet = await db.scalar(
            select(OrganizationCredit).where(OrganizationCredit.organization_id == org_id)
        )
        assert (bot.credit_balance, bot.usage_count, wallet.free_remaining) == (3, 0, 20)


async def test_shared_sql_rate_limit_is_atomic_and_expires():
    store = SQLRateLimitStore()
    results = await asyncio.gather(*(store.eval("", 1, "concurrent-rate", 60) for _ in range(20)))
    assert sorted(results) == list(range(1, 21))
    async with SessionFactory.begin() as db:
        await db.execute(
            update(RateLimitCounter)
            .where(RateLimitCounter.id == "concurrent-rate")
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
    assert await store.eval("", 1, "concurrent-rate", 60) == 1


async def test_simultaneous_webhooks_only_grant_order_once(client, independent_requests):
    org_id, _bot_id, headers = await account_and_bot(client)
    created = await client.post("/api/v1/payments/orders/product/C100", headers=headers)
    assert created.status_code == 201
    order = created.json()
    payload = {
        "id": 987654,
        "gateway": "Test Bank",
        "transactionDate": "2026-10-10 10:00:00",
        "accountNumber": "123456789",
        "content": order["order_code"],
        "transferType": "in",
        "transferAmount": order["amount"],
        "referenceCode": "TEST",
    }

    async def webhook(provider_id):
        return await client.post(
            "/api/v1/webhooks/sepay",
            json={**payload, "id": provider_id},
            headers={"Authorization": "Apikey test-sepay-key"},
        )

    duplicates = await asyncio.gather(*(webhook(987654) for _ in range(8)))
    assert all(response.status_code == 200 for response in duplicates)
    async with SessionFactory() as db:
        assert await db.scalar(select(func.count()).select_from(Transaction)) == 1
    repeated_payments = await asyncio.gather(*(webhook(987655 + index) for index in range(8)))
    assert all(response.status_code == 200 for response in repeated_payments)
    async with SessionFactory() as db:
        wallet = await db.scalar(
            select(OrganizationCredit).where(OrganizationCredit.organization_id == org_id)
        )
        assert wallet.purchased_remaining == 100
        assert (
            await db.scalar(
                select(func.count()).select_from(Transaction).where(Transaction.status == "SUCCESS")
            )
            == 1
        )


async def test_refresh_token_can_only_be_rotated_once(client, independent_requests):
    tokens, _me = await register(client, "refresh-race@example.com", "Test")
    responses = await asyncio.gather(
        *(
            client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
            for _ in range(6)
        )
    )
    assert sorted(response.status_code for response in responses) == [200, 401, 401, 401, 401, 401]


async def test_concurrent_chatbot_creation_obeys_slot_limit(client, independent_requests):
    tokens, me = await register(client, "slots@example.com", "Test")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    responses = await asyncio.gather(
        *(
            client.post("/api/v1/chatbots", headers=headers, json={"name": f"Bot {index}"})
            for index in range(6)
        )
    )
    assert sorted(response.status_code for response in responses) == [201, 402, 402, 402, 402, 402]


async def test_parallel_credit_allocation_keeps_total_balance(client, independent_requests):
    org_id, bot_id, headers = await account_and_bot(client)
    async with SessionFactory.begin() as db:
        await db.execute(
            update(OrganizationCredit)
            .where(OrganizationCredit.organization_id == org_id)
            .values(purchased_remaining=100)
        )
    responses = await asyncio.gather(
        *(
            client.post(f"/api/v1/chatbots/{bot_id}/credits", headers=headers, json={"amount": 30})
            for _ in range(6)
        )
    )
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 409, 409, 409]
    async with SessionFactory() as db:
        bot = await db.get(Chatbot, bot_id)
        wallet = await db.scalar(
            select(OrganizationCredit).where(OrganizationCredit.organization_id == org_id)
        )
        assert (wallet.purchased_remaining, bot.credit_balance) == (10, 90)
    # Không để session chung của fixture giữ một snapshot cũ khi kiểm tra phần còn lại.
    await get_test_database().rollback()
