from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.records import add_record, make_record
from app.core.security import digest_token
from app.models.entities import OrganizationCredit, PasswordResetToken, RefreshSession, User
from tests.conftest import get_test_database


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
    session_lifetime = datetime.fromisoformat(tokens["session_expires_at"]) - datetime.now(UTC)
    assert timedelta(hours=3, minutes=59) < session_lifetime <= timedelta(hours=4)

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
    refreshed_expiry = datetime.fromisoformat(refreshed.json()["session_expires_at"])
    original_expiry = datetime.fromisoformat(tokens["session_expires_at"])
    assert abs(refreshed_expiry - original_expiry) < timedelta(milliseconds=1)

    reused = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reused.status_code == 401


async def test_session_has_an_absolute_four_hour_limit(client: AsyncClient):
    tokens, _ = await register(client, "expired-session@example.com", "Expired Session")
    db = get_test_database()
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.token_digest == digest_token(tokens["refresh_token"]))
        .values(
            **{
                **{
                    "created_at": datetime.now(UTC) - timedelta(hours=5),
                    "expires_at": datetime.now(UTC) + timedelta(days=1),
                }
            }
        )
    )
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401


async def test_logout_revokes_access_and_refresh_tokens(client: AsyncClient):
    tokens, _ = await register(client, "logout@example.com", "Logout Company")
    response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 204
    assert (
        await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
    ).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401


async def test_expired_access_token_is_rejected_and_response_hides_password_hash(client):
    tokens, me = await register(client, "expired-access@example.com", "Expired Access")
    assert "password_hash" not in me
    assert "password" not in me
    settings = get_settings()
    payload = jwt.get_unverified_claims(tokens["access_token"])
    payload["exp"] = datetime.now(UTC) - timedelta(minutes=1)
    expired = jwt.encode(payload, settings.app_secret_key.get_secret_value(), algorithm="HS256")
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401
    assert response.json()["error_code"] == "HTTP_401"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


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


async def test_dashboard_summary_loads_for_new_organization(client: AsyncClient):
    tokens, me = await register(client, "dashboard@example.com", "Dashboard Company")
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "X-Organization-ID": me["organizations"][0]["id"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["current_plan"] == "Miễn phí"
    assert response.json()["daily_used"] == 0
    assert response.json()["free_credits_remaining"] == 20
    assert response.json()["chatbot_slots"] == 1


async def test_free_chatbot_limit_and_per_bot_credit_allocation(client: AsyncClient):
    tokens, me = await register(client, "limits@example.com", "Limits Company")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    first = await client.post("/api/v1/chatbots", json={"name": "Bot miễn phí"}, headers=headers)
    assert first.status_code == 201, first.text
    second = await client.post("/api/v1/chatbots", json={"name": "Bot thứ hai"}, headers=headers)
    assert second.status_code == 402

    db = get_test_database()
    await db.execute(
        update(OrganizationCredit)
        .where(OrganizationCredit.organization_id == organization_id)
        .values(**{"purchased_remaining": OrganizationCredit.purchased_remaining + 250})
    )
    allocated = await client.post(
        f"/api/v1/chatbots/{first.json()['id']}/credits",
        headers=headers,
        json={"amount": 100},
    )
    assert allocated.status_code == 200, allocated.text
    assert allocated.json()["credit_balance"] == 100
    balance = await client.get("/api/v1/payments/balance", headers=headers)
    assert balance.json()["purchased_remaining"] == 150

    reclaimed = await client.post(
        f"/api/v1/chatbots/{first.json()['id']}/credits",
        headers=headers,
        json={"amount": -40},
    )
    assert reclaimed.status_code == 200, reclaimed.text
    assert reclaimed.json()["credit_balance"] == 60
    removed = await client.delete(f"/api/v1/chatbots/{first.json()['id']}", headers=headers)
    assert removed.status_code == 204, removed.text
    refunded = await client.get("/api/v1/payments/balance", headers=headers)
    assert refunded.json()["purchased_remaining"] == 250
    assert refunded.json()["chatbot_count"] == 0
    replacement = await client.post(
        "/api/v1/chatbots", json={"name": "Bot thay thế"}, headers=headers
    )
    assert replacement.status_code == 201, replacement.text


async def test_password_reset_token_is_one_time_and_revokes_sessions(client: AsyncClient):
    tokens, _ = await register(client, "reset@example.com", "Reset Company")
    plain_token = "one-time-reset-token-with-enough-entropy-for-test"
    db = get_test_database()
    user = await db.scalar(
        select(User)
        .where(User.email == "reset@example.com")
        .limit(1)
        .execution_options(populate_existing=True)
    )
    assert user is not None
    await add_record(
        db,
        PasswordResetToken,
        make_record(
            user_id=user["id"],
            token_digest=digest_token(plain_token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
            used_at=None,
        ),
    )

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
