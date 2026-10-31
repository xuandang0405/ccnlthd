import pytest
from httpx import AsyncClient

from app.core.config import get_settings


@pytest.mark.no_db
@pytest.mark.parametrize("allowed_origin", [True, False])
async def test_admin_put_preflight(client: AsyncClient, allowed_origin: bool):
    origin = get_settings().cors_origins[0] if allowed_origin else "https://untrusted.invalid"
    response = await client.options(
        "/api/v1/admin/settings/moderation",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == (200 if allowed_origin else 400)
    if allowed_origin:
        assert response.headers["Access-Control-Allow-Origin"] == origin
        assert "PUT" in response.headers["Access-Control-Allow-Methods"].split(", ")
    else:
        assert "Access-Control-Allow-Origin" not in response.headers
