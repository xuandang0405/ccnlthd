import hashlib
import secrets
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def create_access_token(user_id: UUID, session_id: UUID) -> tuple[str, datetime]:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode(
        {"sub": str(user_id), "sid": str(session_id), "type": "access", "exp": expires_at},
        settings.app_secret_key.get_secret_value(),
        algorithm=ALGORITHM,
    )
    return token, expires_at


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.app_secret_key.get_secret_value(), algorithms=[ALGORITHM]
        )
        if payload.get("type") != "access":
            raise ValueError("Unexpected token type")
        return UUID(payload["sub"]), UUID(payload["sid"])
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid or expired access token") from exc


def new_refresh_token() -> tuple[str, str]:
    plain = secrets.token_urlsafe(48)
    digest = hashlib.sha256(plain.encode()).hexdigest()
    return plain, digest


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def ensure_utc(value: datetime) -> datetime:
    """Normalize values returned by drivers that drop timezone metadata."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def session_expiration(session: Mapping[str, Any]) -> datetime:
    """Return the configured absolute expiry, including for older long-lived sessions."""
    settings = get_settings()
    stored_expiry = ensure_utc(session["expires_at"])
    created_at = ensure_utc(session.get("created_at", stored_expiry))
    configured_expiry = created_at + timedelta(hours=settings.login_session_hours)
    return min(stored_expiry, configured_expiry)
