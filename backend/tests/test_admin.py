from app.core.mongodb import get_mongo_database
from tests.test_auth_and_tenants import register


async def test_super_admin_access_is_server_enforced(client):
    tokens, me = await register(client, "admin@example.com", "Admin Company")
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    forbidden = await client.get("/api/v1/admin/summary", headers=auth)
    assert forbidden.status_code == 403

    db = get_mongo_database()
    result = await db.users.update_one(
        {"email": "admin@example.com"}, {"$set": {"is_super_admin": True}}
    )
    assert result.matched_count == 1

    summary = await client.get("/api/v1/admin/summary", headers=auth)
    assert summary.status_code == 200
    assert summary.json()["organizations"] == 1
    organizations = await client.get("/api/v1/admin/organizations", headers=auth)
    assert organizations.status_code == 200
    assert organizations.json()[0]["id"] == me["organizations"][0]["id"]
