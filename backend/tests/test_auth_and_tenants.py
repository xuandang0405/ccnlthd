from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import SessionFactory
from app.core.security import digest_token
from app.models.entities import PasswordResetToken, User


def registration_payload(email: str, company: str) -> dict:
    return {
        "full_name": "Nguyễn Văn Test",
        "email": email,
        "password": "StrongPassword123",
        "password_confirmation": "StrongPassword123",
        "organization_name": company,
    }


async def register(client: AsyncClient, email: str, company: str) -> tuple[dict, dict]:
    response = await client.post("/api/v1/auth/register", json=registration_payload(email, company))
    assert response.status_code == 201, response.text
    tokens = response.json()
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200, me.text
    return tokens, me.json()


async def test_register_login_refresh_and_logout(client: AsyncClient):
    tokens, me = await register(client, "owner@example.com", "Công ty Alpha")
    assert me["email"] == "owner@example.com"
    assert me["organizations"][0]["role"] == "BUSINESS_OWNER"

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "StrongPassword123"},
    )
    assert login.status_code == 200

    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["refresh_token"] != tokens["refresh_token"]

    reused = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reused.status_code == 401


async def test_chatbot_crud_is_tenant_isolated(client: AsyncClient):
    alpha_tokens, alpha_me = await register(client, "alpha@example.com", "Alpha")
    beta_tokens, beta_me = await register(client, "beta@example.com", "Beta")
    alpha_org = alpha_me["organizations"][0]["id"]
    beta_org = beta_me["organizations"][0]["id"]

    alpha_headers = {
        "Authorization": f"Bearer {alpha_tokens['access_token']}",
        "X-Organization-ID": alpha_org,
    }
    created = await client.post(
        "/api/v1/chatbots", json={"name": "Trợ lý Alpha"}, headers=alpha_headers
    )
    assert created.status_code == 201, created.text
    chatbot_id = created.json()["id"]

    forged_headers = {
        "Authorization": f"Bearer {beta_tokens['access_token']}",
        "X-Organization-ID": alpha_org,
    }
    forged = await client.get(f"/api/v1/chatbots/{chatbot_id}", headers=forged_headers)
    assert forged.status_code == 403

    beta_headers = {
        "Authorization": f"Bearer {beta_tokens['access_token']}",
        "X-Organization-ID": beta_org,
    }
    direct_object_reference = await client.get(
        f"/api/v1/chatbots/{chatbot_id}", headers=beta_headers
    )
    assert direct_object_reference.status_code == 404


async def test_password_reset_token_is_one_time_and_revokes_sessions(client: AsyncClient):
    tokens, _ = await register(client, "reset@example.com", "Reset Company")
    plain_token = "one-time-reset-token-with-enough-entropy-for-test"
    async with SessionFactory() as db:
        user = await db.scalar(select(User).where(User.email == "reset@example.com"))
        assert user is not None
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_digest=digest_token(plain_token),
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        await db.commit()

    confirmed = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": plain_token, "new_password": "NewStrongPassword456"},
    )
    assert confirmed.status_code == 204, confirmed.text
    reused = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": plain_token, "new_password": "AnotherPassword789"},
    )
    assert reused.status_code == 400
    old_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert old_refresh.status_code == 401
    new_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "NewStrongPassword456"},
    )
    assert new_login.status_code == 200
