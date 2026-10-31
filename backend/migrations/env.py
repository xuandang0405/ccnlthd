import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.core.database import Base, UTCDateTime
from app.models import entities  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def include_object(_object, name, kind, reflected, compare_to):
    # Giữ bảng của tích hợp đã ngừng dùng; không tự sinh DROP làm mất dữ liệu cũ.
    archived_tables = {"telegram_connections", "notification_logs"}
    return not (kind == "table" and reflected and compare_to is None and name in archived_tables)


def render_item(kind, item, autogen_context):
    # Migration mới phải có import cho kiểu thời gian UTC dùng trong model.
    if kind == "type" and isinstance(item, UTCDateTime):
        autogen_context.imports.add("from app.core.database import UTCDateTime")
        return "UTCDateTime()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_item=render_item,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(run_migrations)
    finally:
        await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
