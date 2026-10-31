from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError

from app.core.redis import RedisLike

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

INCREMENT_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


class QuotaUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class QuotaResult:
    used: int
    limit: int | None
    remaining: int | None
    reset_at: datetime


def next_midnight_vietnam(now: datetime | None = None) -> datetime:
    localized = (now or datetime.now(VIETNAM)).astimezone(VIETNAM)
    tomorrow = localized.date() + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=VIETNAM)


class QuotaService:
    def __init__(self, redis: RedisLike):
        self.redis = redis

    async def consume_daily(self, organization_id: str, limit: int | None) -> QuotaResult:
        now = datetime.now(VIETNAM)
        reset_at = next_midnight_vietnam(now)
        ttl = max(1, int((reset_at - now).total_seconds()))
        key = f"quota:organization:{organization_id}:date:{now.date().isoformat()}"
        try:
            used = int(await self.redis.eval(INCREMENT_SCRIPT, 1, key, ttl))
        except (RedisError, SQLAlchemyError) as exc:
            raise QuotaUnavailableError("Không thể kiểm tra quota lúc này") from exc
        remaining = None if limit is None else max(0, limit - used)
        return QuotaResult(used=used, limit=limit, remaining=remaining, reset_at=reset_at)

    async def consume_visitor_rate(self, session_id: str, limit: int = 30) -> int:
        key = f"rate:visitor:{session_id}:minute"
        try:
            used = int(await self.redis.eval(INCREMENT_SCRIPT, 1, key, 60))
        except (RedisError, SQLAlchemyError) as exc:
            raise QuotaUnavailableError("Không thể kiểm tra giới hạn chống spam") from exc
        return used
