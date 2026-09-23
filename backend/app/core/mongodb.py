from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient
from pymongo.server_api import ServerApi

from app.core.config import get_settings

_client: AsyncMongoClient | None = None


def get_mongo_client() -> AsyncMongoClient:
    global _client
    settings = get_settings()
    if settings.mongodb_uri is None:
        raise RuntimeError("MONGODB_URI chưa được cấu hình")
    if _client is None:
        _client = AsyncMongoClient(
            settings.mongodb_uri.get_secret_value(),
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=10_000,
            connectTimeoutMS=10_000,
        )
    return _client


def get_mongo_database():
    settings = get_settings()
    return get_mongo_client()[settings.mongodb_database]


async def get_mongo_db() -> AsyncIterator[Any]:
    yield get_mongo_database()


class MongoRecord:
    def __init__(self, document: dict[str, Any]):
        self._document = document

    def __getattr__(self, name: str) -> Any:
        key = "_id" if name == "id" else name
        try:
            return self._document[key]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __getitem__(self, name: str) -> Any:
        return self._document[name]

    def get(self, name: str, default: Any = None) -> Any:
        return self._document.get(name, default)

    def as_dict(self) -> dict[str, Any]:
        return dict(self._document)


def record(document: dict[str, Any] | None) -> MongoRecord | None:
    return MongoRecord(document) if document is not None else None


def new_document(**values: Any) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {"_id": str(uuid4()), "created_at": now, "updated_at": now, **values}


async def ensure_mongo_indexes() -> None:
    db = get_mongo_database()
    indexes: dict[str, list[tuple[list[tuple[str, int]], bool]]] = {
        "users": [([("email", ASCENDING)], True)],
        "organizations": [([("slug", ASCENDING)], True)],
        "organization_members": [
            (["organization_id", "user_id"], True),
            (["user_id"], False),
        ],
        "plans": [([("code", ASCENDING)], True)],
        "subscriptions": [(["organization_id", "is_active"], False)],
        "refresh_sessions": [([("token_digest", ASCENDING)], True)],
        "password_reset_tokens": [([("token_digest", ASCENDING)], True)],
        "chatbots": [([("public_id", ASCENDING)], True), (["organization_id"], False)],
        "documents": [([("storage_key", ASCENDING)], True), (["organization_id"], False)],
        "document_chunks": [(["document_id", "chunk_index"], True)],
        "chatbot_documents": [(["chatbot_id", "document_id"], True)],
        "visitor_sessions": [([("token_digest", ASCENDING)], True)],
        "conversations": [(["organization_id", "updated_at"], False)],
        "messages": [(["conversation_id", "created_at"], False)],
        "leads": [([("source_message_id", ASCENDING)], False), (["organization_id"], False)],
        "payment_orders": [([("order_code", ASCENDING)], True), (["organization_id"], False)],
        "transactions": [(["provider", "provider_transaction_id"], True)],
        "usage_logs": [(["organization_id", "usage_date"], False)],
        "notification_logs": [([("deduplication_key", ASCENDING)], True)],
        "telegram_connections": [([("organization_id", ASCENDING)], True)],
        "audit_logs": [([("created_at", DESCENDING)], False)],
        "rate_limit_counters": [([("expires_at", ASCENDING)], False)],
    }
    for collection_name, definitions in indexes.items():
        collection = db[collection_name]
        for fields, unique in definitions:
            normalized = [
                field if isinstance(field, tuple) else (field, ASCENDING) for field in fields
            ]
            is_expiration_index = collection_name == "rate_limit_counters" and normalized == [
                ("expires_at", ASCENDING)
            ]
            options = {"expireAfterSeconds": 0} if is_expiration_index else {}
            await collection.create_index(normalized, unique=unique, **options)


async def close_mongo_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
