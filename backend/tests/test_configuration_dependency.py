import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings, get_settings
from app.main import app

pytestmark = pytest.mark.no_db


async def test_webhook_settings_dependency_can_be_overridden_without_global_mutation():
    original = get_settings()
    test_settings = Settings(
        app_env="test", sepay_auth_mode="API_KEY", sepay_api_key="dependency-test-key"
    )
    payload = {
        "id": 902, "gateway": "MBBank", "transactionDate": "2026-10-14 10:00:00",
        "accountNumber": "123456789", "content": "not-an-order",
        "transferType": "in", "transferAmount": 100,
    }
    app.dependency_overrides[get_settings] = lambda: test_settings
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            invalid = await client.post("/api/v1/webhooks/sepay", json=payload)
            valid = await client.post(
                "/api/v1/webhooks/sepay", json=payload,
                headers={"Authorization": "Apikey dependency-test-key"},
            )
        assert invalid.status_code == 401
        assert valid.status_code == 200
        assert get_settings() is original
    finally:
        app.dependency_overrides.pop(get_settings, None)
