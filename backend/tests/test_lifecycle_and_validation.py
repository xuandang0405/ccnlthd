from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import main
from app.core.redis import InMemoryRedis

pytestmark = pytest.mark.no_db


@pytest.mark.parametrize("startup_fails", [False, True])
async def test_lifespan_checks_schema_and_always_disposes_engine(
    monkeypatch, tmp_path, startup_fails
):
    check_schema = AsyncMock(side_effect=RuntimeError("schema mismatch") if startup_fails else None)
    dispose = AsyncMock()
    monkeypatch.setattr(main, "check_schema_ready", check_schema)
    monkeypatch.setattr(main, "engine", SimpleNamespace(dispose=dispose))
    monkeypatch.setattr(main.settings, "upload_dir", tmp_path / "uploads")
    if startup_fails:
        with pytest.raises(RuntimeError, match="schema mismatch"):
            async with main.lifespan(FastAPI()):
                pytest.fail("Không được nhận request khi schema chưa đúng")
    else:
        async with main.lifespan(FastAPI()):
            check_schema.assert_awaited_once()
            dispose.assert_not_awaited()
        assert main.settings.upload_dir.is_dir()
    dispose.assert_awaited_once()


@pytest.mark.parametrize("database_ready", [False, True])
async def test_readiness_reports_database_failure_without_private_error(
    monkeypatch, database_ready
):
    schema_check = AsyncMock(
        side_effect=None if database_ready else RuntimeError("private-database-error")
    )
    monkeypatch.setattr(main, "check_schema_ready", schema_check)
    monkeypatch.setattr(main, "create_redis_client", InMemoryRedis)
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as client:
        response = await client.get("/health/ready")
        live = await client.get("/health/live")
    assert response.status_code == (200 if database_ready else 503)
    assert response.json()["components"]["database"] == ("up" if database_ready else "down")
    assert "private-database-error" not in response.text
    assert live.status_code == 200


@pytest.mark.parametrize("path", ["/", "/app"])
async def test_missing_frontend_build_is_a_structured_503(monkeypatch, tmp_path, path):
    monkeypatch.setattr(main, "frontend_dist", tmp_path)
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as client:
        response = await client.get(path)
    assert response.status_code == 503
    assert response.json()["error_code"] == "HTTP_503"


@pytest.mark.parametrize(
    "field,value",
    [
        ("full_name", "   "),
        ("organization_name", "   "),
        ("password", "ONLYUPPERCASE123"),
        ("password", "onlylowercase123"),
        ("password", "LettersWithoutDigits"),
        ("password_confirmation", "DifferentPassword123"),
    ],
)
async def test_register_validator_errors_do_not_echo_passwords(field, value):
    payload = {
        "email": "validation@example.com", "full_name": "Người kiểm thử",
        "organization_name": "Doanh nghiệp kiểm thử",
        "password": "StrongPassword123", "password_confirmation": "StrongPassword123",
    }
    payload[field] = value
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as client:
        response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert "StrongPassword123" not in response.text
    assert all("input" not in item and "ctx" not in item for item in response.json()["detail"])
