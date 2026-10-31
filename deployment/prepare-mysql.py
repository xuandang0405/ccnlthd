"""Kiểm tra kết nối và schema; không tạo/xóa bảng hoặc thay đổi dữ liệu."""

import asyncio

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.core.database import Base, engine
from app.models import entities  # noqa: F401


async def main() -> int:
    url = make_url(get_settings().database_url)
    if url.get_backend_name() != "mysql":
        print("[LOI] DATABASE_URL phai dung mysql+aiomysql.")
        return 1
    try:
        head = ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
        async with engine.connect() as connection:
            table_names = await connection.run_sync(lambda conn: inspect(conn).get_table_names())
            missing = set(Base.metadata.tables) - set(table_names)
            if missing or "alembic_version" not in table_names:
                print("[LOI] Database chua co du schema cua du an.")
                print("Nhap database/schema_mysql.sql vao database trong backend/.env.")
                print("Hoac chay: .venv\\Scripts\\python.exe -m alembic upgrade head")
                return 1
            revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            if revision != head:
                print(
                    "[LOI] Schema chua dung phien ban. Sao luu truoc khi chay alembic upgrade head."
                )
                return 1
        print(f"MySQL/MariaDB da san sang: {url.host}:{url.port or 3306}/{url.database}")
        return 0
    except Exception as exc:
        print(f"[LOI] Khong kiem tra duoc MySQL ({type(exc).__name__}).")
        print("Kiem tra MySQL da bat, DATABASE_URL, ten database va quyen tai khoan.")
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
