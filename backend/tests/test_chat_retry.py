"""Gửi lại cùng mã tin nhắn không được ghi hội thoại hoặc trừ lượt lần hai."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import Request, Response
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.api import public_chat
from app.core.redis import get_redis
from app.integrations.gemini import GeminiServiceError
from app.main import app
from app.models.entities import Chatbot, ChatRequest, Message
from app.schemas.public_chat import PublicChatRequest
from app.services.chat_requests import (
    ChatRequestInProgress,
    claim_request,
    lock_attempt,
    release_failed_request,
)
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register
from tests.test_public_chat import FakeRedis


@pytest.fixture
async def chat(client: AsyncClient):
    tokens, me = await register(client, "retry@example.com", "Retry test")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    created = await client.post("/api/v1/chatbots", json={"name": "Retry bot"}, headers=headers)
    assert created.status_code == 201
    public_id = created.json()["public_id"]
    session = await client.post(f"/api/v1/public/chat/{public_id}/sessions")
    assert session.status_code == 201

    class CountingGemini:
        calls = 0

        async def generate(self, **_kwargs):
            self.calls += 1
            return "Câu trả lời được lưu để gửi lại."

    gemini = CountingGemini()
    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    app.dependency_overrides[public_chat.get_gemini_service] = lambda: gemini
    try:
        yield {
            "url": f"/api/v1/public/chat/{public_id}/messages",
            "visitor": {"X-Visitor-Token": session.json()["visitor_token"]},
            "headers": headers,
            "bot_id": created.json()["id"],
            "organization_id": me["organizations"][0]["id"],
            "conversation_id": session.json()["conversation_id"],
            "gemini": gemini,
        }
    finally:
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(public_chat.get_gemini_service, None)


@pytest.mark.parametrize("paid", [False, True])
async def test_same_message_id_returns_saved_reply_without_charging_again(client, chat, paid):
    db = get_test_database()
    if paid:
        bot = await db.get(Chatbot, chat["bot_id"])
        bot.credit_balance = 5
        await db.commit()
    payload = {"message": "Giá sản phẩm A?", "client_message_id": str(uuid4())}
    first = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    second = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert chat["gemini"].calls == 1
    assert await db.scalar(select(func.count()).select_from(Message)) == 2
    balance = await client.get("/api/v1/payments/balance", headers=chat["headers"])
    assert balance.json()["free_remaining"] == (20 if paid else 19)
    bot = await db.get(Chatbot, chat["bot_id"], populate_existing=True)
    assert bot.credit_balance == (4 if paid else 0)
    assert bot.usage_count == 1


async def test_reusing_message_id_for_different_text_is_rejected(client, chat):
    message_id = str(uuid4())
    first = await client.post(
        chat["url"],
        headers=chat["visitor"],
        json={
            "message": "Câu hỏi thứ nhất",
            "client_message_id": message_id,
        },
    )
    second = await client.post(
        chat["url"],
        headers=chat["visitor"],
        json={
            "message": "Câu hỏi khác",
            "client_message_id": message_id,
        },
    )
    assert first.status_code == 200
    assert second.status_code == 409
    assert chat["gemini"].calls == 1


async def test_same_text_with_new_message_id_is_a_new_question(client, chat):
    for _ in range(2):
        result = await client.post(
            chat["url"],
            headers=chat["visitor"],
            json={
                "message": "Cùng một câu hỏi",
                "client_message_id": str(uuid4()),
            },
        )
        assert result.status_code == 200
    assert chat["gemini"].calls == 2


async def test_message_id_must_be_a_uuid(client, chat):
    result = await client.post(
        chat["url"],
        headers=chat["visitor"],
        json={
            "message": "Xin chào",
            "client_message_id": "not-a-uuid",
        },
    )
    assert result.status_code == 422
    assert chat["gemini"].calls == 0


async def test_sql_unavailable_before_reservation_returns_retryable_error(
    client, chat, monkeypatch
):
    original_verify = public_chat.verified_session

    async def unavailable(*_args):
        raise OperationalError("SELECT", None, ConnectionError(), connection_invalidated=True)

    monkeypatch.setattr(public_chat, "verified_session", unavailable)
    payload = {"message": "Xin chào", "client_message_id": str(uuid4())}
    first = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert first.status_code == 503 and first.headers["Retry-After"] == "2"
    assert chat["gemini"].calls == 0
    monkeypatch.setattr(public_chat, "verified_session", original_verify)
    second = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert second.status_code == 200 and second.json()["remaining_credits"] == 19


@pytest.mark.parametrize("paid", [False, True])
async def test_gemini_timeout_fallback_is_saved_and_refunded_only_once(
    client, chat, monkeypatch, paid
):
    db = get_test_database()
    if paid:
        bot = await db.get(Chatbot, chat["bot_id"])
        bot.credit_balance = 5
        await db.commit()
    calls = 0

    async def timeout(**_kwargs):
        nonlocal calls
        calls += 1
        raise GeminiServiceError("Injected Gemini timeout")

    monkeypatch.setattr(chat["gemini"], "generate", timeout)
    payload = {"message": "Xin chào", "client_message_id": str(uuid4())}
    first = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    replay = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert calls == 1
    assert await db.scalar(select(func.count()).select_from(Message)) == 2
    balance = await client.get("/api/v1/payments/balance", headers=chat["headers"])
    assert balance.json()["free_remaining"] == 20
    bot = await db.get(Chatbot, chat["bot_id"], populate_existing=True)
    assert bot.credit_balance == (5 if paid else 0)
    assert bot.usage_count == 0


async def test_cancelled_chat_refunds_reservation_and_can_be_retried(client, chat, monkeypatch):
    original_generate = chat["gemini"].generate

    async def cancel(**_kwargs):
        raise asyncio.CancelledError()

    monkeypatch.setattr(chat["gemini"], "generate", cancel)
    payload = {"message": "Câu hỏi bị gián đoạn", "client_message_id": str(uuid4())}
    # Gọi endpoint trực tiếp để quan sát CancelledError, không qua middleware HTTP.
    with pytest.raises(asyncio.CancelledError):
        await public_chat.send_message(
            UUID(chat["url"].split("/")[-2]),
            PublicChatRequest(**payload),
            Response(),
            Request({"type": "http", "headers": [], "state": {"request_id": "cancel-test"}}),
            chat["visitor"]["X-Visitor-Token"],
            get_test_database(),
            FakeRedis(),
            chat["gemini"],
        )
    monkeypatch.setattr(chat["gemini"], "generate", original_generate)
    retry = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert retry.status_code == 200 and retry.json()["remaining_credits"] == 19
    assert await get_test_database().scalar(select(func.count()).select_from(Message)) == 2


@pytest.mark.parametrize("paid", [False, True])
@pytest.mark.parametrize("stage", ["reserve", "finish", "refund"])
@pytest.mark.parametrize("after_commit", [False, True])
async def test_sql_error_around_commit_is_reconciled(
    client, chat, monkeypatch, paid, stage, after_commit
):
    db = get_test_database()
    if paid:
        bot = await db.get(Chatbot, chat["bot_id"])
        bot.credit_balance = 5
        await db.commit()
    original_commit = db.commit
    commits = 0
    fault_at = 2 if stage == "reserve" else 3

    async def faulty_commit_once():
        nonlocal commits
        commits += 1
        if commits == fault_at:
            if after_commit:
                await original_commit()
            raise OperationalError(
                "COMMIT",
                None,
                ConnectionError("Injected lost commit acknowledgement"),
                connection_invalidated=True,
            )
        await original_commit()

    monkeypatch.setattr(db, "commit", faulty_commit_once)
    original_save = public_chat.save_chat_exchange
    fail_save = stage == "refund"

    async def save_once_fails(*args, **kwargs):
        nonlocal fail_save
        await original_save(*args, **kwargs)
        if fail_save:
            fail_save = False
            raise RuntimeError("Injected save failure to exercise credit refund")

    monkeypatch.setattr(public_chat, "save_chat_exchange", save_once_fails)
    payload = {"message": "Kiểm tra retry transaction", "client_message_id": str(uuid4())}
    first = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    expected_status = (
        500 if stage == "refund" else 503 if stage == "finish" and not after_commit else 200
    )
    assert first.status_code == expected_status, first.text
    second = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert second.status_code == 200, second.text
    replay = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert replay.status_code == 200 and replay.json() == second.json()
    assert await db.scalar(select(func.count()).select_from(Message)) == 2
    assert await db.scalar(select(func.count()).select_from(ChatRequest)) == 1
    balance = await client.get("/api/v1/payments/balance", headers=chat["headers"])
    assert balance.json()["free_remaining"] == (20 if paid else 19)
    bot = await db.get(Chatbot, chat["bot_id"], populate_existing=True)
    assert bot.credit_balance == (4 if paid else 0)
    assert bot.usage_count == 1


async def test_active_attempt_is_busy_and_expired_attempt_resumes_without_new_debit(client, chat):
    db = get_test_database()
    message_id = str(uuid4())
    payload = {"message": "Tiếp tục sau restart", "client_message_id": message_id}
    await claim_request(
        db,
        chat["organization_id"],
        chat["bot_id"],
        chat["conversation_id"],
        message_id,
        payload["message"],
    )
    busy = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert busy.status_code == 409 and busy.headers["Retry-After"] == "2"
    assert chat["gemini"].calls == 0
    row = await db.scalar(select(ChatRequest))
    row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    completed = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert completed.status_code == 200
    assert completed.json()["remaining_credits"] == 19
    balance = await client.get("/api/v1/payments/balance", headers=chat["headers"])
    assert balance.json()["free_remaining"] == 19
    assert chat["gemini"].calls == 1


async def test_new_message_refunds_abandoned_reservation_and_old_worker_cannot_finish(client, chat):
    db = get_test_database()
    old = await claim_request(
        db,
        chat["organization_id"],
        chat["bot_id"],
        chat["conversation_id"],
        str(uuid4()),
        "Tin nhắn bị bỏ dở",
    )
    row = await db.get(ChatRequest, old.id)
    row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    completed = await client.post(
        chat["url"],
        headers=chat["visitor"],
        json={
            "message": "Câu hỏi mới",
            "client_message_id": str(uuid4()),
        },
    )
    assert completed.status_code == 200
    assert completed.json()["remaining_credits"] == 19
    with pytest.raises(ChatRequestInProgress):
        await lock_attempt(db, old)
    await db.rollback()
    await release_failed_request(db, old)
    balance = await client.get("/api/v1/payments/balance", headers=chat["headers"])
    assert balance.json()["free_remaining"] == 19
    assert await db.scalar(select(func.count()).select_from(Message)) == 2
