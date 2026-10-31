"""MySQL thật: request đồng thời và KILL CONNECTION ngay trước COMMIT."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionFactory, engine
from app.models.entities import Chatbot, ChatRequest, Message, OrganizationCredit
from tests import test_chat_retry, test_mysql_concurrency

chat = test_chat_retry.chat
independent_requests = test_mysql_concurrency.independent_requests

pytestmark = pytest.mark.skipif(engine.dialect.name != "mysql", reason="Cần MySQL thật")


@pytest.mark.parametrize("paid", [False, True])
async def test_concurrent_duplicate_chat_only_charges_once(
    client, chat, independent_requests, paid
):
    if paid:
        async with SessionFactory.begin() as db:
            bot = await db.get(Chatbot, chat["bot_id"])
            bot.credit_balance = 5
    payload = {"message": "Nhiều request cùng một tin nhắn", "client_message_id": str(uuid4())}
    results = await asyncio.gather(
        *[client.post(chat["url"], headers=chat["visitor"], json=payload) for _ in range(12)]
    )
    assert all(result.status_code in {200, 409} for result in results)
    replay = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert replay.status_code == 200
    assert chat["gemini"].calls == 1
    async with SessionFactory() as db:
        bot = await db.get(Chatbot, chat["bot_id"])
        wallet = await db.scalar(
            select(OrganizationCredit).where(
                OrganizationCredit.organization_id == chat["organization_id"],
            )
        )
        assert bot.usage_count == 1
        assert bot.credit_balance == (4 if paid else 0)
        assert wallet.free_remaining == (20 if paid else 19)
        assert await db.scalar(select(func.count()).select_from(Message)) == 2
        assert await db.scalar(select(func.count()).select_from(ChatRequest)) == 1


@pytest.mark.parametrize("paid", [False, True])
@pytest.mark.parametrize("stage", ["reserve", "finish"])
async def test_killed_mysql_connection_does_not_lose_or_duplicate_credit(
    client, chat, independent_requests, monkeypatch, paid, stage
):
    if paid:
        async with SessionFactory.begin() as db:
            bot = await db.get(Chatbot, chat["bot_id"])
            bot.credit_balance = 5
    original_commit = AsyncSession.commit
    killed = False

    async def commit_with_connection_killed_once(db):
        nonlocal killed
        count = db.info.get("retry_test_commits", 0) + 1
        db.info["retry_test_commits"] = count
        target = 1 if stage == "reserve" else 2
        if not killed and count == target:
            await db.flush()
            connection_id = int(await db.scalar(text("SELECT CONNECTION_ID()")))
            async with engine.begin() as killer:
                await killer.execute(text(f"KILL CONNECTION {connection_id}"))
            killed = True
        await original_commit(db)

    monkeypatch.setattr(AsyncSession, "commit", commit_with_connection_killed_once)
    payload = {"message": "Thử mất kết nối MySQL", "client_message_id": str(uuid4())}
    first = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert killed
    assert first.status_code == (200 if stage == "reserve" else 503), first.text
    replay = await client.post(chat["url"], headers=chat["visitor"], json=payload)
    assert replay.status_code == 200, replay.text
    async with SessionFactory() as db:
        bot = await db.get(Chatbot, chat["bot_id"])
        wallet = await db.scalar(
            select(OrganizationCredit).where(
                OrganizationCredit.organization_id == chat["organization_id"],
            )
        )
        assert bot.usage_count == 1
        assert bot.credit_balance == (4 if paid else 0)
        assert wallet.free_remaining == (20 if paid else 19)
        assert await db.scalar(select(func.count()).select_from(Message)) == 2
        assert await db.scalar(select(func.count()).select_from(ChatRequest)) == 1
