import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select

from app.core.database import SessionFactory
from app.integrations.telegram import TelegramService, TelegramServiceError
from app.models.entities import Chatbot, Lead, NotificationLog, TelegramConnection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("notification-worker")


async def claim_notification() -> NotificationLog | None:
    stale_before = datetime.now(UTC) - timedelta(minutes=5)
    async with SessionFactory.begin() as db:
        notification = await db.scalar(
            select(NotificationLog)
            .where(
                NotificationLog.channel == "TELEGRAM",
                NotificationLog.attempts < 5,
                or_(
                    NotificationLog.status.in_(["PENDING", "RETRY"]),
                    (NotificationLog.status == "PROCESSING")
                    & (NotificationLog.updated_at < stale_before),
                ),
            )
            .order_by(NotificationLog.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if notification:
            notification.status = "PROCESSING"
            notification.attempts += 1
            db.expunge(notification)
        return notification


async def process(notification: NotificationLog) -> None:
    try:
        async with SessionFactory() as db:
            row = (
                await db.execute(
                    select(Lead, Chatbot, TelegramConnection)
                    .join(Chatbot, Chatbot.id == Lead.chatbot_id)
                    .join(
                        TelegramConnection,
                        TelegramConnection.organization_id == Lead.organization_id,
                    )
                    .where(
                        Lead.id == notification.lead_id,
                        Lead.organization_id == notification.organization_id,
                        TelegramConnection.is_enabled.is_(True),
                        TelegramConnection.verified_at.is_not(None),
                    )
                )
            ).one_or_none()
        if row is None or not row[2].chat_id:
            raise TelegramServiceError("Kết nối Telegram không còn hoạt động")
        lead, chatbot, connection = row
        text = (
            f"Lead mới từ {chatbot.name}\n"
            f"Tên: {lead.customer_name or 'Chưa cung cấp'}\n"
            f"Điện thoại: {lead.phone or 'Chưa cung cấp'}\n"
            f"Email: {lead.email or 'Chưa cung cấp'}\n"
            f"Nhu cầu: {lead.intent_summary or 'Chưa có mô tả'}\n"
            f"Thời gian: {lead.created_at.isoformat()}"
        )
        await TelegramService().send_message(connection.chat_id, text)
        async with SessionFactory.begin() as db:
            fresh = await db.get(NotificationLog, notification.id, with_for_update=True)
            if fresh:
                fresh.status = "SENT"
                fresh.last_error = None
    except Exception as exc:
        logger.warning(
            "Notification failed id=%s attempt=%s error=%s",
            notification.id,
            notification.attempts,
            type(exc).__name__,
        )
        async with SessionFactory.begin() as db:
            fresh = await db.get(NotificationLog, notification.id, with_for_update=True)
            if fresh:
                fresh.status = "FAILED" if fresh.attempts >= 5 else "RETRY"
                fresh.last_error = f"{type(exc).__name__}: {str(exc)[:200]}"


async def run() -> None:
    logger.info("Notification worker started")
    while True:
        notification = await claim_notification()
        if notification is None:
            await asyncio.sleep(3)
            continue
        await process(notification)


if __name__ == "__main__":
    asyncio.run(run())
