"""Lỗi sau khi trừ lượt phải hoàn đúng nguồn và không lưu hội thoại dở dang."""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.api import public_chat
from app.core.redis import get_redis
from app.integrations.gemini import GeminiServiceError
from app.main import app
from app.models.entities import Chatbot, Message, UsageLog
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register
from tests.test_public_chat import FakeGemini, FakeRedis


@pytest.mark.parametrize("credit_source", ["FREE", "CHATBOT"])
@pytest.mark.parametrize("failure_stage", ["retrieval", "save", "fallback_save", "commit"])
async def test_chat_failure_refunds_once(
    client: AsyncClient, monkeypatch, credit_source: str, failure_stage: str
):
    tokens, me = await register(client, "refund@example.com", "Refund test")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    created = await client.post("/api/v1/chatbots", json={"name": "Refund bot"}, headers=headers)
    assert created.status_code == 201
    chatbot_id = created.json()["id"]
    public_id = created.json()["public_id"]
    session = await client.post(f"/api/v1/public/chat/{public_id}/sessions")
    assert session.status_code == 201
    db = get_test_database()
    if credit_source == "CHATBOT":
        chatbot = await db.get(Chatbot, chatbot_id)
        chatbot.credit_balance = 5
        await db.commit()

    async def failed_retrieval(*_args, **_kwargs):
        raise RuntimeError("Simulated retrieval failure")

    original_save = public_chat.save_chat_exchange

    async def failed_save(*args, **kwargs):
        await original_save(*args, **kwargs)
        await db.flush()
        if failure_stage == "commit":
            original_commit = db.commit

            async def failed_commit_once():
                monkeypatch.setattr(db, "commit", original_commit)
                raise RuntimeError("Simulated commit failure")

            monkeypatch.setattr(db, "commit", failed_commit_once)
            return
        raise RuntimeError("Simulated failure after message writes")

    class UnavailableGemini:
        async def generate(self, **_kwargs):
            raise GeminiServiceError("Simulated Gemini outage")

    if failure_stage == "retrieval":
        monkeypatch.setattr(public_chat, "retrieve_context", failed_retrieval)
    else:
        monkeypatch.setattr(public_chat, "save_chat_exchange", failed_save)
    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    app.dependency_overrides[public_chat.get_gemini_service] = lambda: (
        UnavailableGemini() if failure_stage == "fallback_save" else FakeGemini()
    )
    try:
        result = await client.post(
            f"/api/v1/public/chat/{public_id}/messages",
            headers={"X-Visitor-Token": session.json()["visitor_token"]},
            json={"message": "Sản phẩm A có giá bao nhiêu?"},
        )
        assert result.status_code == 500
        balance = await client.get("/api/v1/payments/balance", headers=headers)
        assert balance.status_code == 200
        assert balance.json()["free_remaining"] == 20
        chatbot = await db.scalar(
            select(Chatbot)
            .where(Chatbot.id == chatbot_id)
            .execution_options(populate_existing=True)
        )
        assert chatbot.credit_balance == (5 if credit_source == "CHATBOT" else 0)
        assert chatbot.usage_count == 0
        assert await db.scalar(select(func.count()).select_from(Message)) == 0
        assert await db.scalar(select(func.count()).select_from(UsageLog)) == 0
    finally:
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(public_chat.get_gemini_service, None)


@pytest.mark.parametrize("credit_source", ["FREE", "CHATBOT"])
async def test_gemini_outage_saves_fallback_without_charging(
    client: AsyncClient, credit_source: str
):
    tokens, me = await register(client, "fallback@example.com", "Fallback test")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    created = await client.post("/api/v1/chatbots", json={"name": "Fallback bot"}, headers=headers)
    assert created.status_code == 201
    chatbot_id, public_id = created.json()["id"], created.json()["public_id"]
    session = await client.post(f"/api/v1/public/chat/{public_id}/sessions")
    assert session.status_code == 201
    db = get_test_database()
    if credit_source == "CHATBOT":
        chatbot = await db.get(Chatbot, chatbot_id)
        chatbot.credit_balance = 5
        await db.commit()

    class UnavailableGemini:
        async def generate(self, **_kwargs):
            raise GeminiServiceError("Simulated Gemini outage")

    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    app.dependency_overrides[public_chat.get_gemini_service] = lambda: UnavailableGemini()
    try:
        result = await client.post(
            f"/api/v1/public/chat/{public_id}/messages",
            headers={"X-Visitor-Token": session.json()["visitor_token"]},
            json={"message": "Sản phẩm A có giá bao nhiêu?"},
        )
        assert result.status_code == 200
        assert result.json()["reply"]
        assert "gemini" not in result.json()["reply"].casefold()
        expected_remaining = 5 if credit_source == "CHATBOT" else 20
        assert result.json()["remaining_credits"] == expected_remaining
        assert result.headers["X-Credit-Remaining"] == str(expected_remaining)
        balance = await client.get("/api/v1/payments/balance", headers=headers)
        assert balance.json()["free_remaining"] == 20
        chatbot = await db.scalar(
            select(Chatbot)
            .where(Chatbot.id == chatbot_id)
            .execution_options(populate_existing=True)
        )
        assert chatbot.credit_balance == (5 if credit_source == "CHATBOT" else 0)
        assert chatbot.usage_count == 0
        assert await db.scalar(select(func.count()).select_from(Message)) == 2
    finally:
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(public_chat.get_gemini_service, None)
