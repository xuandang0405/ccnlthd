from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.core.redis import get_redis
from app.main import app
from app.models.entities import Chatbot, OrganizationCredit
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register


class DisconnectedCounter:
    async def eval(self, *_args):
        raise OperationalError("increment", {}, OSError("isolated test disconnect"))


async def test_rate_counter_sql_disconnect_returns_503_before_credit_is_taken(client):
    tokens, me = await register(client, "quota-disconnect@example.com", "Quota failure")
    org_id = me["organizations"][0]["id"]
    owner = {"Authorization": f"Bearer {tokens['access_token']}", "X-Organization-ID": org_id}
    bot = (await client.post("/api/v1/chatbots", headers=owner, json={"name": "Quota"})).json()
    session = (await client.post(f"/api/v1/public/chat/{bot['public_id']}/sessions")).json()

    async def failed_store():
        yield DisconnectedCounter()

    app.dependency_overrides[get_redis] = failed_store
    try:
        response = await client.post(
            f"/api/v1/public/chat/{bot['public_id']}/messages",
            headers={"X-Visitor-Token": session["visitor_token"]},
            json={"message": "Xin giá laptop"},
        )
    finally:
        app.dependency_overrides.pop(get_redis, None)
    assert response.status_code == 503
    assert "isolated test disconnect" not in response.text
    db = get_test_database()
    wallet = await db.scalar(
        select(OrganizationCredit).where(OrganizationCredit.organization_id == org_id)
    )
    chatbot = await db.get(Chatbot, bot["id"])
    assert (wallet.free_remaining, chatbot.usage_count) == (20, 0)
