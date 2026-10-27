"""Xuất schema + dữ liệu thành SQL trong ZIP; nhập lại vào database trống."""

import argparse
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pymysql
from sqlalchemy.engine import make_url

from app.core.config import get_settings


def quote_identifier(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backup MySQL schema and data without deleting data"
    )
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    destination = args.destination.resolve()
    if destination.exists():
        raise SystemExit("File backup da ton tai; chon ten moi de khong ghi de.")
    url = make_url(get_settings().database_url)
    if url.get_backend_name() != "mysql":
        raise SystemExit("DATABASE_URL phai dung MySQL")
    destination.parent.mkdir(parents=True, exist_ok=True)
    connection = pymysql.connect(
        host=url.host or "127.0.0.1",
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=url.database,
        charset="utf8mb4",
        connect_timeout=10,
    )
    manifest = {
        "format": "mysql-sql-zip-v1",
        "database": url.database,
        "created_at": datetime.now(UTC).isoformat(),
        "tables": {},
    }
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT")
            cursor.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
            table_names = [row[0] for row in cursor.fetchall()]
        with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
            with archive.open("mysql.sql", "w") as output:

                def write_sql(sql: str) -> None:
                    output.write((sql + "\n").encode("utf-8"))

                # Không ghi USE để có thể phục hồi vào một database test/trống khác.
                write_sql("SET NAMES utf8mb4; SET SQL_MODE=''; SET FOREIGN_KEY_CHECKS=0;")
                for name in table_names:
                    quoted_name = quote_identifier(name)
                    with connection.cursor() as cursor:
                        cursor.execute(f"SHOW CREATE TABLE {quoted_name}")
                        write_sql(cursor.fetchone()[1] + ";")
                    count = 0
                    with connection.cursor(pymysql.cursors.SSCursor) as cursor:
                        # Tên bảng lấy từ DB, quote_identifier escape dấu backtick.
                        cursor.execute(f"SELECT * FROM {quoted_name}")  # noqa: S608
                        columns = ",".join(quote_identifier(item[0]) for item in cursor.description)
                        for row in cursor:
                            values = ",".join(connection.escape(value) for value in row)
                            # File SQL cần literal; mỗi giá trị đã qua connection.escape.
                            write_sql(
                                f"INSERT INTO {quoted_name} ({columns}) VALUES ({values});"  # noqa: S608
                            )
                            count += 1
                    manifest["tables"][name] = count
                write_sql("SET FOREIGN_KEY_CHECKS=1;")
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        print("Da sao luu MySQL. Hay giu file ZIP o noi an toan ngoai may chu.")
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
