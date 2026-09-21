import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

TEST_DB = Path(__file__).parent / "test.db"
os.environ["APP_ENV"] = "test"
os.environ["APP_SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-tests"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB.as_posix()}"
os.environ["REDIS_URL"] = "redis://localhost:6399/15"
os.environ["SEPAY_AUTH_MODE"] = "API_KEY"
os.environ["SEPAY_API_KEY"] = "test-sepay-key"
os.environ["PAYMENT_BANK_CODE"] = "TESTBANK"
os.environ["PAYMENT_ACCOUNT_NUMBER"] = "123456789"
os.environ["PAYMENT_ACCOUNT_NAME"] = "TEST ACCOUNT"
os.environ["PAYMENT_PRO_PLAN_AMOUNT"] = "199000"

from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value
