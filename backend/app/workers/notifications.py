import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.mongodb import close_mongo_client, get_mongo_database, record
from app.integrations.telegram import TelegramService, TelegramServiceError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("notification-worker")


async def claim_notification(db: Any):
    now = datetime.now(UTC)
    notification = await db.notification_logs.find_one_and_update(
        {
            "channel": "TELEGRAM",
            "attempts": {"$lt": 5},
            "$or": [
                {"status": {"$in": ["PENDING", "RETRY"]}},
                {"status": "PROCESSING", "updated_at": {"$lt": now - timedelta(minutes=5)}},
            ],
        },
        {"$set": {"status": "PROCESSING", "updated_at": now}, "$inc": {"attempts": 1}},
        sort=[("created_at", 1)],
        return_document=True,
    )
    return record(notification)


async def process(db: Any, notification: Any) -> None:
    try:
        lead = await db.leads.find_one(
            {"_id": notification.lead_id, "organization_id": notification.organization_id}
        )
        chatbot = await db.chatbots.find_one({"_id": lead["chatbot_id"]}) if lead else None
        connection = await db.telegram_connections.find_one(
            {
                "organization_id": notification.organization_id,
                "is_enabled": True,
                "verified_at": {"$ne": None},
            }
        )
        if lead is None or chatbot is None or connection is None or not connection.get("chat_id"):
            raise TelegramServiceError("Kết nối Telegram không còn hoạt động")
        text = (
            f"Lead mới từ {chatbot['name']}\n"
            f"Tên: {lead.get('customer_name') or 'Chưa cung cấp'}\n"
            f"Điện thoại: {lead.get('phone') or 'Chưa cung cấp'}\n"
            f"Email: {lead.get('email') or 'Chưa cung cấp'}\n"
            f"Nhu cầu: {lead.get('intent_summary') or 'Chưa có mô tả'}\n"
            f"Thời gian: {lead['created_at'].isoformat()}"
        )
        await TelegramService().send_message(connection["chat_id"], text)
        await db.notification_logs.update_one(
            {"_id": notification.id},
            {"$set": {"status": "SENT", "last_error": None, "updated_at": datetime.now(UTC)}},
        )
    except Exception as exc:
        logger.warning(
            "Notification failed id=%s attempt=%s error=%s",
            notification.id,
            notification.attempts,
            type(exc).__name__,
        )
        state = "FAILED" if notification.attempts >= 5 else "RETRY"
        await db.notification_logs.update_one(
            {"_id": notification.id},
            {
                "$set": {
                    "status": state,
                    "last_error": f"{type(exc).__name__}: {str(exc)[:200]}",
                    "updated_at": datetime.now(UTC),
                }
            },
        )


async def run() -> None:
    logger.info("Notification worker started")
    db = get_mongo_database()
    try:
        while True:
            notification = await claim_notification(db)
            if notification is None:
                await asyncio.sleep(3)
                continue
            await process(db, notification)
    finally:
        await close_mongo_client()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Notification worker stopped")
