import asyncio
import sqlite3
import threading
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Protocol

from pymongo import ReturnDocument
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.mongodb import get_mongo_database


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
                    connection.execute(
                        "UPDATE counters SET value = ? WHERE key = ?", (value, key)
                    )
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


class MongoRateLimitStore:
    """Atomic counters shared by every application process through MongoDB."""

    async def eval(self, _script: str, _number_of_keys: int, key: str, ttl: int) -> int:
        now = datetime.now(UTC)
        expired = {
            "$lte": [
                {"$ifNull": ["$expires_at", datetime(1970, 1, 1, tzinfo=UTC)]},
                now,
            ]
        }
        document = await get_mongo_database().rate_limit_counters.find_one_and_update(
            {"_id": key},
            [
                {
                    "$set": {
                        "value": {"$cond": [expired, 1, {"$add": ["$value", 1]}]},
                        "expires_at": {
                            "$cond": [expired, now + timedelta(seconds=ttl), "$expires_at"]
                        },
                        "updated_at": now,
                    }
                }
            ],
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(document["value"])

    async def ping(self) -> bool:
        return bool(await get_mongo_database().command("ping"))

    async def aclose(self) -> None:
        return None


_memory_redis = InMemoryRedis()
_sqlite_stores: dict[str, SqliteRateLimitStore] = {}
_mongo_rate_limits = MongoRateLimitStore()


def create_redis_client() -> RedisLike:
    settings = get_settings()
    if settings.rate_limit_backend == "memory":
        return _memory_redis
    if settings.rate_limit_backend == "mongodb":
        return _mongo_rate_limits
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
        if not isinstance(client, (InMemoryRedis, SqliteRateLimitStore, MongoRateLimitStore)):
            await client.aclose()
