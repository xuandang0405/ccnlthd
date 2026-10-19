"""Hàm nhỏ dùng chung giữa các nhóm API quản trị."""

from sqlalchemy import select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Organization


async def organization_names(db: AsyncSession) -> dict[str, str]:
    items = (
        await db.scalars(
            select(Organization).where(true()).execution_options(populate_existing=True)
        )
    ).all()
    return {item["id"]: item["name"] for item in items}
