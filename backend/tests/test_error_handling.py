import json
import logging
from threading import get_ident
from uuid import UUID

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, field_validator

from app.core.errors import ERROR_RESPONSES, register_error_handlers
from app.core.observability import RequestLogFormatter, safe_request_id
from app.main import request_context

pytestmark = pytest.mark.no_db


class ExampleInput(BaseModel):
    quantity: int
    password: str

    @field_validator("password")
    @classmethod
    def reject_invalid_password(cls, value: str) -> str:
        if value == "private-test-password":
            raise ValueError("Mật khẩu không hợp lệ")
        return value


@pytest.fixture
def error_app() -> FastAPI:
    app = FastAPI(responses=ERROR_RESPONSES)
    register_error_handlers(app)
    app.middleware("http")(request_context)

    @app.get("/http/{status_code}")
    def business_error(status_code: int):
        raise HTTPException(status_code, "Lỗi nghiệp vụ", headers={"Retry-After": "60"})

    @app.post("/validate")
    def validate(payload: ExampleInput):
        return {"quantity": payload.quantity}

    @app.get("/unexpected")
    def unexpected():
        raise RuntimeError("internal-test-only-detail")

    @app.get("/wrong-response", response_model=ExampleInput)
    def wrong_response():
        return {"quantity": "not-an-integer"}

    return app


@pytest.mark.parametrize("status_code", [401, 402, 403, 404, 409, 429, 503])
async def test_http_errors_keep_status_headers_and_legacy_detail(error_app, status_code):
    async with AsyncClient(
        transport=ASGITransport(app=error_app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/http/{status_code}", headers={"X-Request-ID": "acceptance-http-test"}
        )
    body = response.json()
    assert response.status_code == status_code
    assert body == {
        "detail": "Lỗi nghiệp vụ",
        "message": "Lỗi nghiệp vụ",
        "error_code": f"HTTP_{status_code}",
        "status_code": status_code,
        "request_id": "acceptance-http-test",
    }
    assert response.headers["X-Request-ID"] == body["request_id"]
    assert response.headers["Retry-After"] == "60"


@pytest.mark.parametrize(
    "payload",
    [
        {"quantity": "wrong-type", "password": "valid-test-value"},
        {"quantity": 1, "password": "private-test-password"},
    ],
)
async def test_validation_errors_are_serializable_and_do_not_echo_input(error_app, payload):
    async with AsyncClient(
        transport=ASGITransport(app=error_app), base_url="http://test"
    ) as client:
        response = await client.post("/validate", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "VALIDATION_ERROR"
    assert body["status_code"] == 422
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert body["detail"]
    assert all(set(item) == {"loc", "msg", "type"} for item in body["detail"])
    assert "private-test-password" not in response.text


@pytest.mark.parametrize("path", ["/unexpected", "/wrong-response"])
async def test_internal_errors_are_generic_and_have_trace_id(error_app, path, caplog):
    async with AsyncClient(
        transport=ASGITransport(app=error_app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.get(path, headers={"X-Request-ID": "acceptance-error-test"})
    assert response.status_code == 500
    assert response.json()["detail"] == "Lỗi hệ thống"
    assert response.json()["error_code"] == "INTERNAL_ERROR"
    assert response.json()["request_id"] == "acceptance-error-test"
    assert "internal-test-only-detail" not in response.text
    assert "internal-test-only-detail" not in caplog.text
    assert "acceptance-error-test" in caplog.text


def test_openapi_describes_shared_error_response(error_app):
    response = error_app.openapi()["paths"]["/validate"]["post"]["responses"]["422"]
    assert response["content"]["application/json"]["schema"]["$ref"].endswith("/ErrorResponse")
    from app.main import app

    for path in ("/health/ready", "/api/v1/health"):
        response = app.openapi()["paths"][path]["get"]["responses"]["503"]
        assert response["content"]["application/json"]["schema"]["$ref"].endswith(
            "/ReadinessResponse"
        )


@pytest.mark.parametrize("value", [None, "", "bad\nrequest-id", "x" * 129])
def test_invalid_request_ids_are_replaced(value):
    assert UUID(safe_request_id(value))


def test_access_log_is_json_and_only_contains_request_metadata():
    record = logging.LogRecord("app.access", logging.INFO, "", 0, "HTTP request", (), None)
    record.request_id = "acceptance-log-test"
    record.method = "GET"
    record.path = "/health/live"
    record.status = 200
    record.duration_ms = 1.25
    body = json.loads(RequestLogFormatter().format(record))
    assert body["request_id"] == "acceptance-log-test"
    assert body["duration_ms"] == 1.25
    assert set(body) == {
        "timestamp", "level", "event", "request_id", "method", "path", "status", "duration_ms"
    }


async def test_existing_frontend_route_runs_file_checks_in_worker_thread(monkeypatch, tmp_path):
    from app import main

    caller_thread = get_ident()
    checked_threads = []
    (tmp_path / "index.html").write_text(
        "<html><body>Test frontend</body></html>", encoding="utf-8"
    )
    real_path_type = type(tmp_path)
    real_is_file = real_path_type.is_file

    def tracked_is_file(path):
        checked_threads.append(get_ident())
        return real_is_file(path)

    monkeypatch.setattr(main, "frontend_dist", tmp_path)
    monkeypatch.setattr(real_path_type, "is_file", tracked_is_file)
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    assert "Test frontend" in response.text
    assert checked_threads[0] != caller_thread
