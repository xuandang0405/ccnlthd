"""Sổ tin nhắn: trừ/hoàn lượt và đổi trạng thái trong cùng transaction ngắn."""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.exc import TimeoutError as SQLTimeoutError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import ChatRequest
from app.services.credits import consume_credit, ensure_credit_account, refund_credit

logger = logging.getLogger(__name__)
LEASE_SECONDS = 180


class ChatRequestConflict(RuntimeError):
    pass


class ChatRequestInProgress(RuntimeError):
    pass


class ChatStorageUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ChatAttempt:
    id: str
    organization_id: str
    token: str
    response_data: dict | None = None


def message_hash(message: str) -> str:
    return hashlib.sha256(message.encode()).hexdigest()


def transient_database_error(error: DBAPIError | SQLTimeoutError) -> bool:
    if isinstance(error, SQLTimeoutError):
        return True
    code = error.orig.args[0] if error.orig.args else None
    return error.connection_invalidated or code in {1205, 1213, 2006, 2013}


async def completed_response(
    db: AsyncSession,
    organization_id: str,
    conversation_id: str,
    client_message_id: str,
    message: str,
) -> dict | None:
    row = await db.scalar(
        select(ChatRequest)
        .where(
            ChatRequest.organization_id == organization_id,
            ChatRequest.conversation_id == conversation_id,
            ChatRequest.client_message_id == client_message_id,
        )
        .execution_options(populate_existing=True)
    )
    if row is not None and row.message_hash != message_hash(message):
        raise ChatRequestConflict("Mã tin nhắn này đã được dùng cho nội dung khác")
    return row.response_data if row is not None and row.status == "COMPLETED" else None


async def claim_request(
    db: AsyncSession,
    organization_id: str,
    chatbot_id: str,
    conversation_id: str,
    client_message_id: str,
    message: str,
) -> ChatAttempt:
    token = str(uuid4())
    for attempt in range(2):
        try:
            # Giữ thứ tự khóa ví trước như các luồng phân bổ/xóa chatbot hiện có.
            await ensure_credit_account(db, organization_id)
            # Lượt bị bỏ dở được trả lại khi doanh nghiệp gửi một tin nhắn mới.
            # Yêu cầu đang retry chính nó vẫn tiếp tục lượt đã giữ, không trừ lại.
            now = datetime.now(UTC)
            expired = (
                await db.scalars(
                    select(ChatRequest)
                    .where(
                        ChatRequest.organization_id == organization_id,
                        ChatRequest.status == "PROCESSING",
                        ChatRequest.lease_until <= now,
                        or_(
                            ChatRequest.conversation_id != conversation_id,
                            ChatRequest.client_message_id != client_message_id,
                        ),
                    )
                    .order_by(ChatRequest.id)
                    .limit(30)
                    .with_for_update()
                )
            ).all()
            for abandoned in expired:
                if abandoned.credit_source is not None:
                    abandoned.remaining_credits = await refund_credit(
                        db,
                        organization_id,
                        abandoned.chatbot_id,
                        abandoned.credit_source,
                        commit=False,
                    )
                abandoned.credit_source = None
                abandoned.status = "RETRYABLE"
                abandoned.updated_at = now
            row = await db.scalar(
                select(ChatRequest)
                .where(
                    ChatRequest.organization_id == organization_id,
                    ChatRequest.conversation_id == conversation_id,
                    ChatRequest.client_message_id == client_message_id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if row is not None:
                if row.message_hash != message_hash(message):
                    raise ChatRequestConflict("Mã tin nhắn này đã được dùng cho nội dung khác")
                if row.status == "COMPLETED":
                    result = ChatAttempt(
                        row.id, organization_id, row.attempt_token, row.response_data
                    )
                    await db.commit()
                    return result
                if (
                    row.status == "PROCESSING"
                    and row.attempt_token != token
                    and row.lease_until > now
                ):
                    raise ChatRequestInProgress(
                        "Tin nhắn đang được xử lý. Vui lòng gửi lại cùng mã sau ít giây."
                    )
            else:
                row = ChatRequest(
                    organization_id=organization_id,
                    chatbot_id=chatbot_id,
                    conversation_id=conversation_id,
                    client_message_id=client_message_id,
                    message_hash=message_hash(message),
                    attempt_token=token,
                    lease_until=now,
                )
                db.add(row)
                await db.flush()
            if row.credit_source is None:
                credit = await consume_credit(db, organization_id, chatbot_id, commit=False)
                row.credit_source = credit.source
                row.remaining_credits = credit.remaining
            # Nếu tiến trình cũ chết, tiếp tục lượt đã giữ; không trừ lượt mới.
            row.status = "PROCESSING"
            row.attempt_token = token
            row.lease_until = now + timedelta(seconds=LEASE_SECONDS)
            row.updated_at = now
            result = ChatAttempt(row.id, organization_id, token)
            await db.commit()
            return result
        except (DBAPIError, SQLTimeoutError) as exc:
            await db.rollback()
            if not transient_database_error(exc):
                raise
            logger.warning(
                "Chat claim SQL retry=%s client_message_id=%s", attempt + 1, client_message_id
            )
            if attempt == 1:
                raise ChatStorageUnavailable(
                    "Chưa xác nhận được tin nhắn. Hãy gửi lại với cùng mã."
                ) from exc
            await asyncio.sleep(0.1)
    raise AssertionError("Unreachable")


async def lock_attempt(db: AsyncSession, attempt: ChatAttempt) -> ChatRequest:
    await ensure_credit_account(db, attempt.organization_id)
    row = await db.scalar(
        select(ChatRequest)
        .where(
            ChatRequest.id == attempt.id,
            ChatRequest.organization_id == attempt.organization_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None or row.status != "PROCESSING" or row.attempt_token != attempt.token:
        raise ChatRequestInProgress("Lượt xử lý đã thay đổi. Hãy gửi lại cùng mã tin nhắn.")
    return row


async def release_failed_request(db: AsyncSession, attempt: ChatAttempt) -> dict | None:
    """Đối soát trước khi hoàn: COMMIT có thể thành công dù client nhận lỗi SQL."""
    for retry in range(2):
        try:
            await ensure_credit_account(db, attempt.organization_id)
            row = await db.scalar(
                select(ChatRequest)
                .where(
                    ChatRequest.id == attempt.id,
                    ChatRequest.organization_id == attempt.organization_id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if row is not None and row.status == "COMPLETED":
                response = row.response_data
                await db.commit()
                return response
            if (
                row is not None
                and row.status == "PROCESSING"
                and row.attempt_token == attempt.token
            ):
                if row.credit_source is not None:
                    row.remaining_credits = await refund_credit(
                        db, row.organization_id, row.chatbot_id, row.credit_source, commit=False
                    )
                row.credit_source = None
                row.status = "RETRYABLE"
                row.updated_at = datetime.now(UTC)
            await db.commit()
            return None
        except (DBAPIError, SQLTimeoutError) as exc:
            await db.rollback()
            if not transient_database_error(exc):
                raise
            logger.warning("Chat reconcile SQL retry=%s chat_request_id=%s", retry + 1, attempt.id)
            if retry == 1:
                raise ChatStorageUnavailable(
                    "Chưa đối soát được lượt chat. Hãy gửi lại cùng mã sau khi máy chủ ổn định."
                ) from exc
            await asyncio.sleep(0.1)
    raise AssertionError("Unreachable")
