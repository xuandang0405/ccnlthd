from httpx import AsyncClient

from app.main import app


def test_openapi_describes_login_request_and_validation_response():
    schema = app.openapi()
    login = schema["paths"]["/api/v1/auth/login"]["post"]
    request_schema = login["requestBody"]["content"]["application/json"]["schema"]

    assert request_schema["$ref"].endswith("/LoginRequest")
    assert "200" in login["responses"]
    assert "422" in login["responses"]
    assert "email" in schema["components"]["schemas"]["LoginRequest"]["required"]


async def test_invalid_login_input_is_rejected_by_pydantic(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "not-an-email", "password": "password"}
    )

    assert response.status_code == 422
    assert any("email" in item["loc"] for item in response.json()["detail"])
