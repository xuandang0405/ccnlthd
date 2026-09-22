import asyncio
import time
from collections.abc import AsyncIterator
from typing import Protocol

from redis.asyncio import Redis

from app.core.config import get_settings


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


_memory_redis = InMemoryRedis()


def create_redis_client() -> RedisLike:
    settings = get_settings()
    if settings.rate_limit_backend == "memory":
        return _memory_redis
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def get_redis() -> AsyncIterator[RedisLike]:
    client = create_redis_client()
    try:
        yield client
    finally:
        if not isinstance(client, InMemoryRedis):
            await client.aclose()
