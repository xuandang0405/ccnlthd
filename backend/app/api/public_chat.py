import asyncio
import hashlib
import json
import logging
import secrets
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import and_, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.exc import TimeoutError as SQLTimeoutError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.records import add_record, add_records, make_record
from app.core.redis import RedisLike, get_redis
from app.core.security import digest_token, ensure_utc
from app.integrations.gemini import GeminiService, GeminiServiceError
from app.models.entities import (
    Chatbot,
    Conversation,
    Lead,
    LeadStatus,
    Message,
    MessageRole,
    UsageLog,
    VisitorSession,
)
from app.schemas.operations import LeadResponse, PublicLeadCreate
from app.schemas.public_chat import (
    PublicChatRequest,
    PublicChatResponse,
    SourceReference,
    VisitorSessionResponse,
)
from app.services.chat_requests import (
    ChatRequestConflict,
    ChatRequestInProgress,
    ChatStorageUnavailable,
    claim_request,
    completed_response,
    lock_attempt,
    release_failed_request,
)
from app.services.credits import CreditUnavailableError, refund_credit
from app.services.fallback_chat import build_fallback_reply
from app.services.quota import QuotaService, QuotaUnavailableError
from app.services.retrieval import retrieve_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/chat", tags=["Public Widget"])


def get_gemini_service() -> GeminiService:
    return GeminiService()


def origin_allowed(origin: str | None, configured_json: str) -> bool:
    try:
        domains = json.loads(configured_json)
    except json.JSONDecodeError:
        return False
    if not domains:
        return True
    if not origin:
        return False
    host = (urlparse(origin).hostname or "").lower()
    return any(host == value.lower() for value in domains)


async def active_chatbot(db: AsyncSession, public_id: UUID):
    chatbot = await db.scalar(
        select(Chatbot)
        .where(and_(Chatbot.public_id == str(public_id), Chatbot.is_active.is_(True)))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if chatbot is None:
        raise HTTPException(status_code=404, detail="Chatbot không tồn tại hoặc đã tắt")
    return chatbot


@router.post("/{public_id}/sessions", response_model=VisitorSessionResponse, status_code=201)
async def create_visitor_session(
    public_id: UUID,
    request: Request,
    widget_origin: str | None = Header(default=None, alias="X-Widget-Origin"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    chatbot = await active_chatbot(db, public_id)
    claimed_origin = widget_origin or request.headers.get("origin")
    if not origin_allowed(claimed_origin, chatbot.allowed_domains):
        raise HTTPException(status_code=403, detail="Domain không được phép nhúng chatbot")
    token = secrets.token_urlsafe(40)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    visitor = make_record(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        token_digest=digest_token(token),
        expires_at=expires_at,
        last_seen_at=datetime.now(UTC),
    )
    conversation = make_record(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        visitor_session_id=visitor["id"],
        status="OPEN",
    )
    visitor = await add_record(db, VisitorSession, visitor)
    conversation = await add_record(db, Conversation, conversation)
    return VisitorSessionResponse(
        visitor_token=token,
        conversation_id=conversation["id"],
        greeting=chatbot.greeting,
        primary_color=chatbot.primary_color,
        expires_at=expires_at,
    )


async def verified_session(db: AsyncSession, public_id: UUID, visitor_token: str):
    visitor = await db.scalar(
        select(VisitorSession)
        .where(VisitorSession.token_digest == digest_token(visitor_token))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if visitor is None or ensure_utc(visitor["expires_at"]) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Phiên khách truy cập không hợp lệ")
    chatbot = await db.scalar(
        select(Chatbot)
        .where(
            and_(
                Chatbot.id == visitor["chatbot_id"],
                Chatbot.public_id == str(public_id),
                Chatbot.is_active.is_(True),
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    conversation = await db.scalar(
        select(Conversation)
        .where(
            and_(Conversation.visitor_session_id == visitor["id"], Conversation.status == "OPEN")
        )
        .order_by(Conversation.created_at.desc())
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if chatbot is None or conversation is None:
        raise HTTPException(status_code=401, detail="Phiên khách truy cập không hợp lệ")
    return visitor, chatbot, conversation


@router.post("/{public_id}/leads", response_model=LeadResponse, status_code=201)
async def create_public_lead(
    public_id: UUID,
    payload: PublicLeadCreate,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    visitor, chatbot, conversation = await verified_session(db, public_id, visitor_token)
    if not payload.has_contact():
        raise HTTPException(status_code=422, detail="Cần cung cấp email hoặc số điện thoại")
    source_message_id = str(payload.source_message_id) if payload.source_message_id else None
    if source_message_id:
        message = await db.scalar(
            select(Message)
            .where(
                and_(
                    Message.id == source_message_id,
                    Message.conversation_id == conversation.id,
                    Message.organization_id == chatbot.organization_id,
                )
            )
            .limit(1)
            .execution_options(populate_existing=True)
        )
        if message is None:
            raise HTTPException(status_code=404, detail="Tin nhắn nguồn không hợp lệ")
        if await db.scalar(
            select(Lead)
            .where(Lead.source_message_id == source_message_id)
            .limit(1)
            .execution_options(populate_existing=True)
        ):
            raise HTTPException(status_code=409, detail="Lead đã được ghi nhận từ tin nhắn này")
    lead = make_record(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        conversation_id=conversation.id,
        source_message_id=source_message_id,
        customer_name=payload.customer_name,
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        intent_summary=payload.intent_summary,
        status=LeadStatus.NEW.value,
        assigned_user_id=None,
    )
    lead = await add_record(db, Lead, lead)
    await db.execute(
        update(VisitorSession)
        .where(VisitorSession.id == visitor.id)
        .values(**{**{"last_seen_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}})
    )
    return lead


async def check_visitor_rate_limit(redis: RedisLike, visitor_id: str) -> None:
    """Chặn khách gửi quá 30 tin nhắn trong một phút."""
    try:
        request_count = await QuotaService(redis).consume_visitor_rate(visitor_id)
    except QuotaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if request_count > 30:
        raise HTTPException(
            status_code=429,
            detail="Bạn đang gửi tin nhắn quá nhanh",
            headers={"Retry-After": "60"},
        )


async def save_chat_exchange(
    db: AsyncSession,
    *,
    visitor_id: str,
    organization_id: str,
    chatbot_id: str,
    conversation_id: str,
    question: str,
    reply: str,
    sources: list[SourceReference],
) -> None:
    """Lưu câu hỏi, câu trả lời và thời điểm hoạt động của cuộc trò chuyện."""
    now = datetime.now(UTC)
    await add_records(
        db,
        Message,
        [
            make_record(
                organization_id=organization_id,
                conversation_id=conversation_id,
                role=MessageRole.USER.value,
                content=question,
                source_metadata=None,
            ),
            make_record(
                organization_id=organization_id,
                conversation_id=conversation_id,
                role=MessageRole.ASSISTANT.value,
                content=reply,
                source_metadata=json.dumps([source.model_dump(mode="json") for source in sources]),
            ),
        ],
    )
    await add_record(
        db,
        UsageLog,
        make_record(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            event_type="CHAT_MESSAGE",
            quantity=1,
            usage_date=date.today(),
        ),
    )
    await db.execute(
        update(VisitorSession)
        .where(VisitorSession.id == visitor_id)
        .values(**{**{"last_seen_at": now, "updated_at": now}})
    )
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(**{**{"updated_at": now}})
    )


@router.post("/{public_id}/messages", response_model=PublicChatResponse)
async def send_message(
    public_id: UUID,
    payload: PublicChatRequest,
    response: Response,
    http_request: Request,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: AsyncSession = Depends(get_db, scope="function"),
    redis: RedisLike = Depends(get_redis),
    gemini: GeminiService = Depends(get_gemini_service),
):
    try:
        visitor, chatbot, conversation = await verified_session(db, public_id, visitor_token)
        # Rollback có thể làm ORM hết hiệu lực; giữ lại các giá trị cần để hoàn lượt.
        organization_id, chatbot_id = chatbot.organization_id, chatbot.id
        visitor_id, conversation_id, tone = visitor.id, conversation.id, chatbot.tone
        saved = await completed_response(
            db, organization_id, conversation_id, str(payload.client_message_id), payload.message
        )
        if saved is not None:
            result = PublicChatResponse.model_validate(saved)
            response.headers["X-Credit-Remaining"] = str(result.remaining_credits)
            return result
        await check_visitor_rate_limit(redis, visitor_id)
        attempt = await claim_request(
            db,
            organization_id,
            chatbot_id,
            conversation_id,
            str(payload.client_message_id),
            payload.message,
        )
    except CreditUnavailableError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except ChatRequestConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChatRequestInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc), headers={"Retry-After": "2"}) from exc
    except (ChatStorageUnavailable, DBAPIError, SQLTimeoutError) as exc:
        await db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Chưa xác nhận được tin nhắn. Vui lòng gửi lại với cùng mã.",
            headers={"Retry-After": "2"},
        ) from exc

    if attempt.response_data is not None:
        result = PublicChatResponse.model_validate(attempt.response_data)
        response.headers["X-Credit-Remaining"] = str(result.remaining_credits)
        return result

    try:
        context, sources, match_found = await retrieve_context(
            db, organization_id, chatbot_id, payload.message
        )
        gemini_failed = False
        try:
            reply = await gemini.generate(
                question=payload.message,
                context=context,
                tone=tone,
                match_found=match_found,
            )
        except GeminiServiceError:
            gemini_failed = True
            reply = build_fallback_reply(payload.message, context, match_found)

        # Chỉ ghi ID và mã băm để đối chiếu, không ghi tài liệu hoặc token.
        logger.info("chat_generation %s", json.dumps({
            "request_id": http_request.state.request_id,
            "model": getattr(gemini, "_model", None),
            "fallback": gemini_failed,
            "document_ids": [str(source.document_id) for source in sources],
            "context_sha256": hashlib.sha256(context.encode()).hexdigest(),
        }))
        request = await lock_attempt(db, attempt)
        remaining_credits = request.remaining_credits
        if gemini_failed and request.credit_source is not None:
            remaining_credits = await refund_credit(
                db, organization_id, chatbot_id, request.credit_source, commit=False
            )
            request.credit_source = None
        request.remaining_credits = remaining_credits
        await save_chat_exchange(
            db,
            visitor_id=visitor_id,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            conversation_id=conversation_id,
            question=payload.message,
            reply=reply,
            sources=sources,
        )
        result = PublicChatResponse(
            reply=reply,
            conversation_id=conversation_id,
            remaining_daily=remaining_credits,
            remaining_credits=remaining_credits,
            reset_at=None,
            sources=sources,
        )
        request.status = "COMPLETED"
        request.response_data = result.model_dump(mode="json")
        # Tin nhắn, kết quả retry và hoàn lượt (nếu có) cùng một transaction.
        await db.commit()
    except (Exception, asyncio.CancelledError) as exc:
        await db.rollback()
        try:
            saved = await release_failed_request(db, attempt)
        except ChatStorageUnavailable as reconcile_error:
            raise HTTPException(
                status_code=503, detail=str(reconcile_error), headers={"Retry-After": "2"}
            ) from reconcile_error
        if saved is not None and not isinstance(exc, asyncio.CancelledError):
            result = PublicChatResponse.model_validate(saved)
            remaining_credits = result.remaining_credits
        elif isinstance(exc, (DBAPIError, SQLTimeoutError)):
            raise HTTPException(
                status_code=503,
                detail="Gửi tin nhắn chưa hoàn tất. Vui lòng thử lại cùng mã.",
                headers={"Retry-After": "2"},
            ) from exc
        elif isinstance(exc, ChatRequestInProgress):
            raise HTTPException(
                status_code=409, detail=str(exc), headers={"Retry-After": "2"}
            ) from exc
        else:
            raise

    response.headers["X-Credit-Remaining"] = str(remaining_credits)
    return result
