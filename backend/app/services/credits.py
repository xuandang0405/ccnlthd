from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pymongo import ReturnDocument

from app.core.mongodb import new_document


class CreditUnavailableError(RuntimeError):
    pass


async def ensure_credit_account(db: Any, organization_id: str, session: Any = None):
    await db.organization_credits.update_one(
        {"organization_id": organization_id},
        {
            "$setOnInsert": new_document(
                organization_id=organization_id,
                free_remaining=20,
                purchased_remaining=0,
            )
        },
        upsert=True,
        session=session,
    )
    return await db.organization_credits.find_one(
        {"organization_id": organization_id}, session=session
    )


async def ensure_organization_limits(db: Any, organization_id: str, session: Any = None):
    await db.organization_limits.update_one(
        {"organization_id": organization_id},
        {
            "$setOnInsert": new_document(
                organization_id=organization_id,
                chatbot_slots=1,
            )
        },
        upsert=True,
        session=session,
    )
    return await db.organization_limits.find_one(
        {"organization_id": organization_id}, session=session
    )


@dataclass(frozen=True)
class CreditResult:
    source: str
    remaining: int


async def consume_credit(db: Any, organization_id: str, chatbot_id: str) -> CreditResult:
    now = datetime.now(UTC)
    chatbot = await db.chatbots.find_one_and_update(
        {"_id": chatbot_id, "organization_id": organization_id, "credit_balance": {"$gt": 0}},
        {"$inc": {"credit_balance": -1, "usage_count": 1}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if chatbot is not None:
        return CreditResult(source="CHATBOT", remaining=int(chatbot.get("credit_balance", 0)))

    await ensure_credit_account(db, organization_id)
    account = await db.organization_credits.find_one_and_update(
        {"organization_id": organization_id, "free_remaining": {"$gt": 0}},
        {"$inc": {"free_remaining": -1}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if account is None:
        raise CreditUnavailableError(
            "Đã hết lượt chat. Vui lòng mua thêm lượt và phân bổ cho chatbot."
        )
    await db.chatbots.update_one(
        {"_id": chatbot_id}, {"$inc": {"usage_count": 1}, "$set": {"updated_at": now}}
    )
    return CreditResult(source="FREE", remaining=int(account["free_remaining"]))


async def refund_credit(db: Any, organization_id: str, chatbot_id: str, source: str) -> int:
    now = datetime.now(UTC)
    if source == "CHATBOT":
        chatbot = await db.chatbots.find_one_and_update(
            {"_id": chatbot_id},
            {"$inc": {"credit_balance": 1, "usage_count": -1}, "$set": {"updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return int(chatbot.get("credit_balance", 0)) if chatbot else 0
    account = await db.organization_credits.find_one_and_update(
        {"organization_id": organization_id},
        {"$inc": {"free_remaining": 1}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    await db.chatbots.update_one(
        {"_id": chatbot_id}, {"$inc": {"usage_count": -1}, "$set": {"updated_at": now}}
    )
    return int(account.get("free_remaining", 0)) if account else 0
