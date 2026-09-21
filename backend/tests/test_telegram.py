import re

from app.api.telegram import get_telegram_service
from app.main import app
from tests.test_auth_and_tenants import register


class FakeTelegram:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_message(self, chat_id: str, text: str) -> None:
        self.sent.append((chat_id, text))


async def test_telegram_destination_requires_challenge_confirmation(client):
    tokens, me = await register(client, "telegram@example.com", "Telegram Company")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    fake = FakeTelegram()
    app.dependency_overrides[get_telegram_service] = lambda: fake
    try:
        challenge = await client.post(
            "/api/v1/telegram/challenge", json={"chat_id": "-100123456"}, headers=headers
        )
        assert challenge.status_code == 202, challenge.text
        assert fake.sent[0][0] == "-100123456"
        code = re.search(r"\b\d{6}\b", fake.sent[0][1])
        assert code is not None

        wrong_code = "000000" if code.group(0) != "000000" else "999999"
        wrong = await client.post(
            "/api/v1/telegram/confirm", json={"code": wrong_code}, headers=headers
        )
        assert wrong.status_code == 400

        confirmed = await client.post(
            "/api/v1/telegram/confirm", json={"code": code.group(0)}, headers=headers
        )
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()["enabled"] is True
        assert confirmed.json()["chat_id_hint"] == "***3456"
    finally:
        app.dependency_overrides.pop(get_telegram_service, None)
