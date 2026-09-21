from datetime import datetime

from pydantic import BaseModel, Field


class TelegramChallengeRequest(BaseModel):
    chat_id: str = Field(min_length=1, max_length=100)


class TelegramConfirmRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class TelegramStatus(BaseModel):
    configured: bool
    enabled: bool
    chat_id_hint: str | None
    verified_at: datetime | None
