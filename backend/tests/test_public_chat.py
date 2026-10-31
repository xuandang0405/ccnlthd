from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.api.public_chat import get_gemini_service, retrieve_context
from app.core.config import get_settings
from app.core.records import add_record, add_records, make_record
from app.core.redis import SqliteRateLimitStore, get_redis
from app.main import app
from app.models.entities import ChatbotDocument, Document, DocumentChunk, DocumentChunkToken
from app.services.documents import normalize_search_text, search_tokens
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register


class FakeRedis:
    def __init__(self):
        self.values: dict[str, int] = {}

    async def eval(self, _script: str, _number_of_keys: int, key: str, _ttl: int):
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]


class FakeGemini:
    async def generate(
        self, *, question: str, context: str, tone: str, match_found: bool = True
    ) -> str:
        assert question
        assert tone == "professional"
        assert match_found is False
        return "Tôi chưa có thông tin chính xác trong tài liệu doanh nghiệp."


async def test_sqlite_rate_limit_store_persists(tmp_path):
    path = str(tmp_path / "rate-limits.db")
    first = SqliteRateLimitStore(path)
    assert await first.eval("", 1, "quota:test", 60) == 1
    second = SqliteRateLimitStore(path)
    assert await second.eval("", 1, "quota:test", 60) == 2
    assert await second.ping() is True


async def test_only_widget_page_can_be_embedded(client: AsyncClient):
    widget = await client.get("/widget/667b99a1-c812-496f-a39a-22c04974b13f")
    assert "X-Frame-Options" not in widget.headers
    assert widget.headers["Content-Security-Policy"] == "frame-ancestors *"

    dashboard = await client.get("/app")
    assert dashboard.headers["X-Frame-Options"] == "DENY"
    assert dashboard.headers["Content-Security-Policy"] == "frame-ancestors 'none'"


@pytest.mark.parametrize("index_mode", ["indexed", "legacy", "mixed"])
async def test_retrieval_ranks_exact_excel_product_above_generic_matches(
    client: AsyncClient, index_mode: str
):
    tokens, me = await register(client, "ranking@example.com", "Ranking Company")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    chatbot_response = await client.post(
        "/api/v1/chatbots", json={"name": "Ranking Bot"}, headers=headers
    )
    chatbot_id = chatbot_response.json()["id"]
    db = get_test_database()
    document = make_record(
        organization_id=organization_id,
        original_name="catalog.xlsx",
        storage_key="test/catalog.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=100,
        status="DONE",
        approval_status="APPROVED",
    )
    document = await add_record(db, Document, document)
    await add_record(
        db,
        ChatbotDocument,
        make_record(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            document_id=document["id"],
        ),
    )
    exact = "Tên sản phẩm: Intel Arc B580 12GB | Giá (VNĐ): 8990000"
    contents = [
        f"Tên sản phẩm: Intel Arc A{index} 12GB | Giá (VNĐ): 15000000" for index in range(401)
    ] + [exact]
    chunks = [
        make_record(
            organization_id=organization_id,
            document_id=document["id"],
            chunk_index=index,
            content=content,
            search_text=normalize_search_text(content),
            search_tokens=search_tokens(content),
        )
        for index, content in enumerate(contents)
    ]
    await add_records(db, DocumentChunk, chunks)
    if index_mode != "legacy":
        indexed_chunks = chunks if index_mode == "indexed" else chunks[:-1]
        db.add_all(
            [
                DocumentChunkToken(chunk_id=chunk["id"], token=token)
                for chunk in indexed_chunks
                for token in set(chunk["search_tokens"])
            ]
        )
        await db.flush()

    context, _, matched = await retrieve_context(
        db, organization_id, chatbot_id, "Intel Arc B580 12GB giá bao nhiêu?"
    )
    assert matched is True
    assert context.startswith(exact)

    _, _, missing = await retrieve_context(
        db, organization_id, chatbot_id, "Intel Arc B9999 24GB giá bao nhiêu?"
    )
    assert missing is False
    await db.execute(
        update(Document)
        .where(Document.id == document["id"])
        .values(**{**{"approval_status": "PENDING"}})
    )
    pending_context, _, pending_match = await retrieve_context(
        db, organization_id, chatbot_id, "Intel Arc B580 12GB giá bao nhiêu?"
    )
    assert pending_context == ""
    assert pending_match is False
    await db.execute(update(Document).where(Document.id == document["id"]).values(**{}))
    blocked_context, _, blocked = await retrieve_context(
        db, organization_id, chatbot_id, "Intel Arc B580 12GB giá bao nhiêu?"
    )
    assert blocked_context == ""
    assert blocked is False


async def test_widget_uses_opaque_visitor_session(client: AsyncClient):
    tokens, me = await register(client, "widget@example.com", "Widget Company")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    chatbot = await client.post("/api/v1/chatbots", json={"name": "Widget Bot"}, headers=headers)
    assert chatbot.status_code == 201
    public_id = chatbot.json()["public_id"]

    session = await client.post(f"/api/v1/public/chat/{public_id}/sessions")
    assert session.status_code == 201, session.text
    visitor_token = session.json()["visitor_token"]
    assert visitor_token != tokens["access_token"]

    fake_redis = FakeRedis()

    async def override_redis() -> AsyncIterator[FakeRedis]:
        yield fake_redis

    app.dependency_overrides[get_redis] = override_redis
    app.dependency_overrides[get_gemini_service] = lambda: FakeGemini()
    try:
        widget_origin = get_settings().cors_origins[0]
        message = await client.post(
            f"/api/v1/public/chat/{public_id}/messages",
            headers={"X-Visitor-Token": visitor_token, "Origin": widget_origin},
            json={"message": "Giá sản phẩm A là bao nhiêu?"},
        )
        assert message.status_code == 200, message.text
        assert "chưa có thông tin chính xác" in message.json()["reply"]
        assert message.headers["Access-Control-Allow-Origin"] == widget_origin
        exposed_headers = {
            header.strip().lower()
            for header in message.headers["Access-Control-Expose-Headers"].split(",")
        }
        assert "x-credit-remaining" in exposed_headers
        assert message.headers["X-Credit-Remaining"] == "19"
        assert message.json()["remaining_credits"] == 19

        lead = await client.post(
            f"/api/v1/public/chat/{public_id}/leads",
            headers={"X-Visitor-Token": visitor_token},
            json={
                "customer_name": "Khách hàng Test",
                "phone": "0901234567",
                "intent_summary": "Quan tâm sản phẩm A",
            },
        )
        assert lead.status_code == 201, lead.text

        listed_leads = await client.get("/api/v1/leads", headers=headers)
        assert listed_leads.status_code == 200
        assert listed_leads.json()["total"] == 1

        conversations = await client.get("/api/v1/conversations", headers=headers)
        assert conversations.status_code == 200
        assert conversations.json()["total"] == 1
        assert conversations.json()["items"][0]["chatbot_name"] == "Widget Bot"
        assert conversations.json()["items"][0]["first_question"] == "Giá sản phẩm A là bao nhiêu?"
        detail = await client.get(
            f"/api/v1/conversations/{session.json()['conversation_id']}", headers=headers
        )
        assert detail.status_code == 200
        assert len(detail.json()["messages"]) == 2

        rejected = await client.post(
            f"/api/v1/public/chat/{public_id}/messages",
            headers={"X-Visitor-Token": "invalid-visitor-token"},
            json={"message": "Đọc hội thoại"},
        )
        assert rejected.status_code == 401
    finally:
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_gemini_service, None)
