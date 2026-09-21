from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.entities import User
from tests.test_auth_and_tenants import register


async def test_super_admin_access_is_server_enforced(client):
    tokens, me = await register(client, "admin@example.com", "Admin Company")
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    forbidden = await client.get("/api/v1/admin/summary", headers=auth)
    assert forbidden.status_code == 403

    async with SessionFactory() as db:
        user = await db.scalar(select(User).where(User.email == "admin@example.com"))
        assert user is not None
        user.is_super_admin = True
        await db.commit()

    summary = await client.get("/api/v1/admin/summary", headers=auth)
    assert summary.status_code == 200
    assert summary.json()["organizations"] == 1
    organizations = await client.get("/api/v1/admin/organizations", headers=auth)
    assert organizations.status_code == 200
    assert organizations.json()[0]["id"] == me["organizations"][0]["id"]
