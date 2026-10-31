"""Các thao tác ORM nhỏ dùng chung; điều kiện truy vấn nằm tại nơi gọi."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import ColumnElement, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base


def make_record(**values) -> dict:
    now = datetime.now(UTC)
    return {"id": str(uuid4()), "created_at": now, "updated_at": now, **values}


async def add_record[Model: Base](db: AsyncSession, model: type[Model], values: dict) -> Model:
    item = model(**values)
    # Savepoint cho phép xử lý trùng khóa mà không làm hỏng toàn bộ session.
    async with db.begin_nested():
        db.add(item)
        await db.flush()
    return item


async def add_records[Model: Base](
    db: AsyncSession, model: type[Model], values: list[dict]
) -> None:
    db.add_all(model(**item) for item in values)
    await db.flush()


async def update_record[Model: Base](
    db: AsyncSession,
    model: type[Model],
    condition: ColumnElement,
    *,
    values: dict | None = None,
    increments: dict | None = None,
    defaults: dict | None = None,
    order_by: tuple = (),
) -> Model | None:
    if defaults is not None and db.get_bind().dialect.name == "mysql":
        # Upsert nguyên tử tránh nhiều INSERT cùng chờ rồi nâng khóa khi trùng UNIQUE.
        await db.execute(
            mysql_insert(model).values(**defaults).on_duplicate_key_update(id=model.id)
        )
    query = select(model).where(condition).order_by(*order_by).limit(1).with_for_update()
    item = await db.scalar(query.execution_options(populate_existing=True))
    if item is None and defaults is not None:
        try:
            item = await add_record(db, model, defaults)
        except IntegrityError:
            item = await db.scalar(query.execution_options(populate_existing=True))
    if item is None:
        return None
    for name, amount in (increments or {}).items():
        setattr(item, name, getattr(item, name) + amount)
    for name, value in (values or {}).items():
        setattr(item, name, value)
    await db.flush()
    return item


async def delete_record[Model: Base](
    db: AsyncSession, model: type[Model], condition: ColumnElement
) -> Model | None:
    item = await db.scalar(select(model).where(condition).with_for_update())
    if item is not None:
        await db.delete(item)
        await db.flush()
    return item
