import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import MetaData
from sqlalchemy.engine import Connection, make_url

test_url = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite://")
test_database_name = make_url(test_url).database or ""
if not test_url.startswith("sqlite") and not (
    test_database_name.startswith("ccnlthd_test_") or test_database_name.endswith("_test")
):
    raise RuntimeError("TEST_DATABASE_URL phải trỏ vào database test riêng, không dùng ccnlthd")

os.environ["APP_ENV"] = "test"
os.environ["APP_SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-tests"
os.environ["DATABASE_BACKEND"] = "sql"
os.environ["DATABASE_URL"] = test_url
os.environ["RATE_LIMIT_BACKEND"] = "memory"
os.environ["REDIS_URL"] = "redis://localhost:6399/15"
os.environ["SEPAY_AUTH_MODE"] = "API_KEY"
os.environ["SEPAY_API_KEY"] = "test-sepay-key"
os.environ["PAYMENT_BANK_CODE"] = "TESTBANK"
os.environ["PAYMENT_BANK_BIN"] = "970422"
os.environ["PAYMENT_ACCOUNT_NUMBER"] = "123456789"
os.environ["PAYMENT_ACCOUNT_NAME"] = "TEST ACCOUNT"
os.environ["PAYMENT_PRO_PLAN_AMOUNT"] = "199000"

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base, SessionFactory, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402

_test_database: AsyncSession | None = None


def drop_test_tables(connection: Connection) -> None:
    # Dọn cả bảng test cũ sau migration để khóa ngoại không cản tạo lại schema.
    metadata = MetaData()
    metadata.reflect(bind=connection, only=lambda name, _metadata: name != "alembic_version")
    metadata.drop_all(bind=connection)


def get_test_database() -> AsyncSession:
    if _test_database is None:
        raise RuntimeError("Test database fixture is not active")
    return _test_database


@pytest_asyncio.fixture(autouse=True)
async def clean_database(request: pytest.FixtureRequest, tmp_path: Path) -> AsyncIterator[None]:
    global _test_database
    if request.node.get_closest_marker("no_db"):
        yield
        return
    settings = get_settings()
    old_upload_dir = settings.upload_dir
    settings.upload_dir = tmp_path / "uploads"
    async with engine.begin() as connection:
        await connection.run_sync(drop_test_tables)
        await connection.run_sync(Base.metadata.create_all)
    async with SessionFactory() as db:
        _test_database = db

        async def override_db() -> AsyncIterator[AsyncSession]:
            await db.commit()
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

        app.dependency_overrides[get_db] = override_db
        try:
            yield
        finally:
            app.dependency_overrides.pop(get_db, None)
            await db.rollback()
            _test_database = None
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    settings.upload_dir = old_upload_dir


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value
