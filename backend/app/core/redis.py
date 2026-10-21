import asyncio
import sqlite3
import threading
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Protocol

from redis.asyncio import Redis
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import SessionFactory, engine
from app.core.records import make_record, update_record
from app.models.entities import RateLimitCounter


class RedisLike(Protocol):
    async def eval(self, script: str, number_of_keys: int, key: str, ttl: int) -> int: ...

    async def ping(self) -> bool: ...


class InMemoryRedis:
    """Single-process quota store for local development without Redis."""

    def __init__(self) -> None:
        self._values: dict[str, tuple[int, float]] = {}
        self._lock = asyncio.Lock()

    async def eval(self, _script: str, _number_of_keys: int, key: str, ttl: int) -> int:
        async with self._lock:
            now = time.monotonic()
            current, expires_at = self._values.get(key, (0, 0.0))
            if expires_at <= now:
                current = 0
                expires_at = now + ttl
            current += 1
            self._values[key] = (current, expires_at)
            return current

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


class SqliteRateLimitStore:
    """Persistent, atomic quota store for a single Windows server instance."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = threading.Lock()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path, timeout=30)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS counters ("
            "key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at REAL NOT NULL)"
        )
        return connection

    def _increment(self, key: str, ttl: int) -> int:
        with self._lock:
            connection = self._connect()
            try:
                connection.execute("BEGIN IMMEDIATE")
                now = time.time()
                row = connection.execute(
                    "SELECT value, expires_at FROM counters WHERE key = ?", (key,)
                ).fetchone()
                if row is None or float(row[1]) <= now:
                    value = 1
                    connection.execute(
                        "INSERT INTO counters(key, value, expires_at) VALUES (?, ?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
                        "expires_at=excluded.expires_at",
                        (key, value, now + ttl),
                    )
                else:
                    value = int(row[0]) + 1
                    connection.execute("UPDATE counters SET value = ? WHERE key = ?", (value, key))
                connection.execute("DELETE FROM counters WHERE expires_at <= ?", (now,))
                connection.commit()
                return value
            finally:
                connection.close()

    async def eval(self, _script: str, _number_of_keys: int, key: str, ttl: int) -> int:
        return await asyncio.to_thread(self._increment, key, ttl)

    async def ping(self) -> bool:
        def check() -> bool:
            connection = self._connect()
            try:
                return connection.execute("SELECT 1").fetchone() == (1,)
            finally:
                connection.close()

        return await asyncio.to_thread(check)

    async def aclose(self) -> None:
        return None


class SQLRateLimitStore:
    """Bộ đếm bền vững, dùng chung giữa các tiến trình qua MySQL."""

    async def eval(self, _script: str, _number_of_keys: int, key: str, ttl: int) -> int:
        now = datetime.now(UTC)
        async with SessionFactory.begin() as db:
            counter = await update_record(
                db,
                RateLimitCounter,
                RateLimitCounter.id == key,
                defaults=make_record(id=key, value=0, expires_at=now + timedelta(seconds=ttl)),
            )
            if counter.expires_at <= now:
                counter.value = 0
                counter.expires_at = now + timedelta(seconds=ttl)
            counter.value += 1
            await db.flush()
            return counter.value

    async def ping(self) -> bool:
        async with engine.connect() as connection:
            return await connection.scalar(text("SELECT 1")) == 1

    async def aclose(self) -> None:
        return None


_memory_redis = InMemoryRedis()
_sqlite_stores: dict[str, SqliteRateLimitStore] = {}
_sql_rate_limits = SQLRateLimitStore()


def create_redis_client() -> RedisLike:
    settings = get_settings()
    if settings.rate_limit_backend == "memory":
        return _memory_redis
    if settings.rate_limit_backend == "sql":
        return _sql_rate_limits
    if settings.rate_limit_backend == "sqlite":
        path = str(settings.rate_limit_sqlite_path.resolve())
        if path not in _sqlite_stores:
            settings.rate_limit_sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            _sqlite_stores[path] = SqliteRateLimitStore(path)
        return _sqlite_stores[path]
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def get_redis() -> AsyncIterator[RedisLike]:
    client = create_redis_client()
    try:
        yield client
    finally:
        if not isinstance(client, (InMemoryRedis, SqliteRateLimitStore, SQLRateLimitStore)):
            await client.aclose()
