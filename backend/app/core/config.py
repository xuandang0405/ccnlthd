from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "AI Sales Assistant"
    app_secret_key: SecretStr = SecretStr("development-only-change-this-key")
    app_public_url: str = "http://localhost:8080"
    frontend_origin: str = "http://localhost:5173"
    app_domain: str = "localhost"
    access_token_minutes: int = Field(default=15, ge=5, le=120)
    login_session_hours: int = Field(default=4, ge=1, le=24)

    database_url: str = "mysql+aiomysql://root@127.0.0.1:3306/ccnlthd?charset=utf8mb4"
    database_backend: Literal["sql"] = "sql"
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_backend: Literal["redis", "memory", "sqlite", "sql"] = "sql"
    rate_limit_sqlite_path: Path = Path("../.runtime/rate-limits.db")

    gemini_api_key: SecretStr | None = None
    gemini_model: str | None = None
    gemini_timeout_seconds: float = Field(default=50, ge=10, le=120)
    gemini_attempt_timeout_seconds: float = Field(default=10, ge=3, le=30)

    email_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True
    sepay_auth_mode: str | None = None
    sepay_webhook_secret: SecretStr | None = None
    sepay_api_key: SecretStr | None = None
    sepay_hmac_tolerance_seconds: int = Field(default=300, ge=30, le=900)
    payment_bank_code: str | None = None
    payment_bank_bin: str | None = None
    payment_account_number: str | None = None
    payment_account_name: str | None = None
    payment_pro_plan_amount: int | None = Field(default=None, gt=0)

    upload_dir: Path = Path("storage/uploads")
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    document_max_pages: int = Field(default=500, ge=1, le=2000)
    document_max_cells: int = Field(default=1_000_000, ge=1000, le=2_000_000)

    @field_validator("app_secret_key")
    @classmethod
    def validate_secret(cls, value: SecretStr, info):
        if info.data.get("app_env") == "production" and len(value.get_secret_value()) < 32:
            raise ValueError("APP_SECRET_KEY must contain at least 32 characters in production")
        return value

    @model_validator(mode="after")
    def validate_production_backends(self):
        if self.app_env == "production" and self.rate_limit_backend == "memory":
            raise ValueError("RATE_LIMIT_BACKEND=memory is not allowed in production")
        if self.gemini_attempt_timeout_seconds >= self.gemini_timeout_seconds:
            raise ValueError("GEMINI_ATTEMPT_TIMEOUT_SECONDS must be below GEMINI_TIMEOUT_SECONDS")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [self.frontend_origin.rstrip("/"), self.app_public_url.rstrip("/")]

    @property
    def trusted_hosts(self) -> list[str]:
        return [self.app_domain, "localhost", "127.0.0.1", "test"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
