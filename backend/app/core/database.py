from collections.abc import AsyncIterator
from datetime import UTC
from functools import lru_cache
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import DateTime, MetaData, event, text
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    def get(self, name: str, default: Any = None) -> Any:
        return getattr(self, name, default)

    def __getitem__(self, name: str) -> Any:
        return getattr(self, name)

    def __setitem__(self, name: str, value: Any) -> None:
        setattr(self, name, value)

    def as_dict(self) -> dict[str, Any]:
        return {column.key: getattr(self, column.key) for column in self.__table__.columns}

    def items(self):
        return self.as_dict().items()


class UTCDateTime(TypeDecorator):
    """MySQL lưu DATETIME không kèm múi giờ; ứng dụng luôn dùng UTC."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DATETIME(fsp=6) if dialect.name == "mysql" else DateTime())

    def process_bind_param(self, value, _dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, _dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


settings = get_settings()
engine_options: dict = {"pool_pre_ping": True}
if settings.database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"timeout": 30}
elif settings.database_url.startswith("mysql"):
    # Sau khi chờ khóa, các kiểm tra số dư/số chatbot phải đọc dữ liệu mới nhất.
    engine_options.update(
        pool_recycle=1800, isolation_level="READ COMMITTED", connect_args={"connect_timeout": 10}
    )
    if settings.app_env == "test":
        engine_options["poolclass"] = NullPool
engine = create_async_engine(settings.database_url, **engine_options)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def configure_sqlite(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


@lru_cache
def schema_head() -> str:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    return ScriptDirectory.from_config(config).get_current_head()


async def check_schema_ready() -> None:
    head = schema_head()
    try:
        async with engine.connect() as connection:
            version = await connection.scalar(text("SELECT version_num FROM alembic_version"))
    except Exception as exc:
        raise RuntimeError(
            "MySQL/schema chưa sẵn sàng. Xem database/HUONG_DAN_MYSQL.md và nhập schema_mysql.sql."
        ) from exc
    if version != head:
        raise RuntimeError("Schema chưa đúng phiên bản. Sao lưu rồi chạy alembic upgrade head.")


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
