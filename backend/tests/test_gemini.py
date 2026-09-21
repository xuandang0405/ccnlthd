import pytest

from app.integrations.gemini import GeminiConfigurationError, GeminiService


async def test_gemini_fails_clearly_without_credentials():
    service = GeminiService()
    with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY"):
        await service.generate(question="Giá sản phẩm A?", context="", tone="professional")
