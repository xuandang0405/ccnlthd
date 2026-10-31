from httpx import AsyncClient

from app.main import app
from tests.test_auth_and_tenants import register


async def create_lead(client: AsyncClient):
    tokens, me = await register(client, "web-notices@example.com", "Thông báo Alpha")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    bot = await client.post("/api/v1/chatbots", json={"name": "Tư vấn Alpha"}, headers=headers)
    assert bot.status_code == 201
    public_id = bot.json()["public_id"]
    session = await client.post(f"/api/v1/public/chat/{public_id}/sessions")
    assert session.status_code == 201
    response = await client.post(
        f"/api/v1/public/chat/{public_id}/leads",
        headers={"X-Visitor-Token": session.json()["visitor_token"]},
        json={
            "customer_name": "Khách thử thông báo",
            "phone": "0900000000",
            "intent_summary": "Cần tư vấn laptop học tập",
        },
    )
    assert response.status_code == 201, response.text
    return headers, response.json()


async def test_contact_form_is_visible_in_web_notifications_without_external_services(client):
    headers, lead = await create_lead(client)
    summary = await client.get("/api/v1/dashboard/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["new_lead_count"] == 1
    response = await client.get("/api/v1/leads?status=NEW&page=1&page_size=5", headers=headers)
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == lead["id"]
    assert response.json()["items"][0]["intent_summary"] == "Cần tư vấn laptop học tập"


async def test_viewing_notifications_does_not_change_status_but_contacting_reduces_count(client):
    headers, lead = await create_lead(client)
    for _ in range(2):
        response = await client.get("/api/v1/leads?status=NEW", headers=headers)
        assert response.json()["total"] == 1
    updated = await client.patch(
        f"/api/v1/leads/{lead['id']}", json={"status": "CONTACTED"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "CONTACTED"
    summary = await client.get("/api/v1/dashboard/summary", headers=headers)
    assert summary.json()["new_lead_count"] == 0
    pending = await client.get("/api/v1/leads?status=NEW", headers=headers)
    assert pending.json()["total"] == 0
    all_leads = await client.get("/api/v1/leads", headers=headers)
    assert all_leads.json()["total"] == 1


async def test_web_notifications_are_isolated_between_organizations(client):
    _headers, lead = await create_lead(client)
    tokens, me = await register(client, "other-notices@example.com", "Thông báo Beta")
    other_headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    summary = await client.get("/api/v1/dashboard/summary", headers=other_headers)
    assert summary.json()["new_lead_count"] == 0
    notices = await client.get("/api/v1/leads?status=NEW", headers=other_headers)
    assert notices.json()["total"] == 0
    update = await client.patch(
        f"/api/v1/leads/{lead['id']}", json={"status": "CONTACTED"}, headers=other_headers
    )
    assert update.status_code == 404


async def test_web_notifications_require_login(client):
    assert (await client.get("/api/v1/dashboard/summary")).status_code == 401
    assert (await client.get("/api/v1/leads?status=NEW")).status_code == 401


def test_removed_bot_routes_are_not_advertised_in_openapi():
    assert not any("/telegram" in path for path in app.openapi()["paths"])
