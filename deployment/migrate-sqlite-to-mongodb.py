import argparse
import asyncio
import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.mongodb import (
    close_mongo_client,
    ensure_mongo_indexes,
    get_mongo_database,
)
from pymongo import UpdateOne

TABLES = [
    "users",
    "organizations",
    "organization_members",
    "plans",
    "subscriptions",
    "refresh_sessions",
    "password_reset_tokens",
    "chatbots",
    "documents",
    "document_chunks",
    "chatbot_documents",
    "visitor_sessions",
    "conversations",
    "messages",
    "leads",
    "payment_orders",
    "transactions",
    "usage_logs",
    "quota_logs",
    "notification_logs",
    "telegram_connections",
    "audit_logs",
]

BOOLEAN_FIELDS = {
    "is_active",
    "is_super_admin",
    "is_enabled",
}


def normalize_uuid(value: Any) -> str | None:
    if value is None:
        return None
    return str(UUID(str(value)))


def normalize_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def transform(row: sqlite3.Row) -> dict[str, Any]:
    document: dict[str, Any] = {}
    for key in row:
        value = row[key]
        if key == "id":
            document["_id"] = normalize_uuid(value)
        elif key.endswith("_id") or key == "public_id":
            document[key] = normalize_uuid(value)
        elif key in BOOLEAN_FIELDS:
            document[key] = bool(value)
        elif key.endswith("_at"):
            document[key] = normalize_datetime(value)
        else:
            document[key] = value
    return document


def fingerprint(documents: list[dict[str, Any]]) -> str:
    canonical = json.dumps(documents, default=str, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def migrate(sqlite_path: Path, replace: bool) -> None:
    source = sqlite3.connect(sqlite_path)
    source.row_factory = sqlite3.Row
    database = get_mongo_database()
    report: dict[str, dict[str, Any]] = {}
    try:
        if replace:
            for table in TABLES:
                await database[table].drop()
        for table in TABLES:
            rows = source.execute(
                f'SELECT * FROM "{table}" ORDER BY id'  # noqa: S608
            ).fetchall()
            documents = [transform(row) for row in rows]
            if documents:
                operations = [
                    UpdateOne({"_id": document["_id"]}, {"$set": document}, upsert=True)
                    for document in documents
                ]
                await database[table].bulk_write(operations, ordered=True)
            source_ids = [document["_id"] for document in documents]
            destination_count = (
                await database[table].count_documents({"_id": {"$in": source_ids}})
                if source_ids
                else 0
            )
            if destination_count != len(documents):
                raise RuntimeError(
                    f"Count mismatch for {table}: "
                    f"SQLite={len(documents)}, MongoDB={destination_count}"
                )
            report[table] = {"count": len(documents), "sha256": fingerprint(documents)}
            print(f"{table}: {len(documents)}")
        await ensure_mongo_indexes()
        await database["migration_runs"].insert_one(
            {
                "source": str(sqlite_path),
                "created_at": datetime.now(UTC),
                "tables": report,
            }
        )
        print("MongoDB migration verification: OK")
    finally:
        source.close()
        await close_mongo_client()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "backend" / "sales_assistant.db",
    )
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    if not args.sqlite.is_file():
        raise SystemExit(f"SQLite database not found: {args.sqlite}")
    asyncio.run(migrate(args.sqlite, args.replace))


if __name__ == "__main__":
    main()
