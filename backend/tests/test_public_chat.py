from collections.abc import AsyncIterator

from httpx import AsyncClient

from app.api.public_chat import get_gemini_service
from app.core.redis import SqliteRateLimitStore, get_redis
from app.main import app
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
        message = await client.post(
            f"/api/v1/public/chat/{public_id}/messages",
            headers={"X-Visitor-Token": visitor_token},
            json={"message": "Giá sản phẩm A là bao nhiêu?"},
        )
        assert message.status_code == 200, message.text
        assert "chưa có thông tin chính xác" in message.json()["reply"]
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
