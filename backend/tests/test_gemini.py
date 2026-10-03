import httpx
import pytest
from google.genai import errors

from app.integrations.gemini import GeminiConfigurationError, GeminiService, GeminiServiceError


class FakeModels:
    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    async def generate_content(self, **_kwargs):
        self.calls += 1
        if self.calls <= self.failures:
            raise errors.ServerError(503, {"error": {"message": "unavailable"}})
        return type("Response", (), {"text": "Phản hồi thành công"})()


class FakeClient:
    def __init__(self, failures: int):
        self.aio = type("AsyncClient", (), {})()
        self.aio.models = FakeModels(failures)

        async def close_async():
            return None

        self.aio.aclose = close_async

    def close(self):
        return None


async def test_gemini_fails_clearly_without_credentials():
    service = GeminiService()
    service._api_key = None
    service._model = None
    with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY"):
        await service.generate(question="Giá sản phẩm A?", context="", tone="professional")


async def test_gemini_retries_transient_failures(monkeypatch):
    client = FakeClient(failures=2)
    monkeypatch.setattr("app.integrations.gemini.genai.Client", lambda **_kwargs: client)

    async def skip_delay(_seconds: float):
        return None

    monkeypatch.setattr("app.integrations.gemini.asyncio.sleep", skip_delay)
    service = GeminiService()
    service._api_key = "configured"
    service._model = "gemini-3.1-flash-lite"
    response = await service.generate(question="Giá sản phẩm A?", context="", tone="professional")

    assert response == "Phản hồi thành công"
    assert client.aio.models.calls == 3


async def test_gemini_stops_after_four_transient_failures(monkeypatch):
    client = FakeClient(failures=4)
    monkeypatch.setattr("app.integrations.gemini.genai.Client", lambda **_kwargs: client)

    async def skip_delay(_seconds: float):
        return None

    monkeypatch.setattr("app.integrations.gemini.asyncio.sleep", skip_delay)
    service = GeminiService()
    service._api_key = "configured"
    service._model = "gemini-3.1-flash-lite"

    with pytest.raises(GeminiServiceError, match="tạm quá tải"):
        await service.generate(question="Giá sản phẩm A?", context="", tone="professional")
    assert client.aio.models.calls == 4


def test_gemini_configuration_error_is_subclass_of_service_error():
    assert issubclass(GeminiConfigurationError, GeminiServiceError)


async def test_gemini_retries_network_errors(monkeypatch):
    class NetworkFailingModels:
        def __init__(self):
            self.calls = 0

        async def generate_content(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise httpx.ConnectError("Connection failed")
            return type("Response", (), {"text": "Phản hồi sau lỗi mạng"})()

    class FakeNetworkClient:
        def __init__(self):
            self.aio = type("AsyncClient", (), {})()
            self.aio.models = NetworkFailingModels()

            async def close_async():
                return None

            self.aio.aclose = close_async

        def close(self):
            return None

    network_client = FakeNetworkClient()
    monkeypatch.setattr("app.integrations.gemini.genai.Client", lambda **_kwargs: network_client)

    async def skip_delay(_seconds: float):
        return None

    monkeypatch.setattr("app.integrations.gemini.asyncio.sleep", skip_delay)
    service = GeminiService()
    service._api_key = "configured"
    service._model = "gemini-3.1-flash-lite"
    response = await service.generate(question="Giá sản phẩm A?", context="", tone="professional")

    assert response == "Phản hồi sau lỗi mạng"
    assert network_client.aio.models.calls == 2
