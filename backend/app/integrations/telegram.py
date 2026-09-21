import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TelegramServiceError(RuntimeError):
    pass


class TelegramService:
    def __init__(self):
        settings = get_settings()
        self._token = (
            settings.telegram_platform_bot_token.get_secret_value()
            if settings.telegram_platform_bot_token
            else None
        )

    async def send_message(self, chat_id: str, text: str) -> None:
        if not self._token:
            raise TelegramServiceError("Telegram Bot chưa được cấu hình")
        url = f"https://api.telegram.org/bot{self._token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json={"chat_id": chat_id, "text": text[:4096]})
                response.raise_for_status()
                payload = response.json()
            if not payload.get("ok"):
                raise TelegramServiceError("Telegram từ chối gửi tin nhắn")
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Telegram API request failed: %s", type(exc).__name__)
            raise TelegramServiceError("Không thể gửi tin nhắn Telegram") from exc
