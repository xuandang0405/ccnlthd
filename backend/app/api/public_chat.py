import json
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import RedisLike, get_redis
from app.core.security import digest_token, ensure_utc
from app.integrations.gemini import GeminiService, GeminiServiceError
from app.models.entities import (
    Chatbot,
    ChatbotDocument,
    Conversation,
    Document,
    DocumentChunk,
    DocumentStatus,
    Lead,
    Message,
    MessageRole,
    NotificationLog,
    Plan,
    Subscription,
    TelegramConnection,
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
from app.services.quota import QuotaService, QuotaUnavailableError

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


async def active_chatbot(db: AsyncSession, public_id: UUID) -> Chatbot:
    chatbot = await db.scalar(
        select(Chatbot).where(Chatbot.public_id == public_id, Chatbot.is_active.is_(True))
    )
    if chatbot is None:
        raise HTTPException(status_code=404, detail="Chatbot không tồn tại hoặc đã tắt")
    return chatbot


@router.post("/{public_id}/sessions", response_model=VisitorSessionResponse, status_code=201)
async def create_visitor_session(
    public_id: UUID,
    request: Request,
    widget_origin: str | None = Header(default=None, alias="X-Widget-Origin"),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await active_chatbot(db, public_id)
    claimed_origin = widget_origin or request.headers.get("origin")
    if not origin_allowed(claimed_origin, chatbot.allowed_domains):
        raise HTTPException(status_code=403, detail="Domain không được phép nhúng chatbot")
    token = secrets.token_urlsafe(40)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    session = VisitorSession(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        token_digest=digest_token(token),
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    conversation = Conversation(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        visitor_session_id=session.id,
    )
    db.add(conversation)
    await db.flush()
    return VisitorSessionResponse(
        visitor_token=token,
        conversation_id=conversation.id,
        greeting=chatbot.greeting,
        primary_color=chatbot.primary_color,
        expires_at=expires_at,
    )


async def verified_session(
    db: AsyncSession, public_id: UUID, visitor_token: str
) -> tuple[VisitorSession, Chatbot, Conversation]:
    row = (
        await db.execute(
            select(VisitorSession, Chatbot, Conversation)
            .join(Chatbot, Chatbot.id == VisitorSession.chatbot_id)
            .join(Conversation, Conversation.visitor_session_id == VisitorSession.id)
            .where(
                VisitorSession.token_digest == digest_token(visitor_token),
                Chatbot.public_id == public_id,
                Chatbot.is_active.is_(True),
                Conversation.status == "OPEN",
            )
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
    ).one_or_none()
    if row is None or ensure_utc(row[0].expires_at) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Phiên khách truy cập không hợp lệ")
    return row


@router.post("/{public_id}/leads", response_model=LeadResponse, status_code=201)
async def create_public_lead(
    public_id: UUID,
    payload: PublicLeadCreate,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: AsyncSession = Depends(get_db),
):
    session, chatbot, conversation = await verified_session(db, public_id, visitor_token)
    if not payload.has_contact():
        raise HTTPException(status_code=422, detail="Cần cung cấp email hoặc số điện thoại")
    if payload.source_message_id:
        message = await db.scalar(
            select(Message).where(
                Message.id == payload.source_message_id,
                Message.conversation_id == conversation.id,
                Message.organization_id == chatbot.organization_id,
            )
        )
        if message is None:
            raise HTTPException(status_code=404, detail="Tin nhắn nguồn không hợp lệ")
        if await db.scalar(select(Lead.id).where(Lead.source_message_id == message.id)):
            raise HTTPException(status_code=409, detail="Lead đã được ghi nhận từ tin nhắn này")
    lead = Lead(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        conversation_id=conversation.id,
        source_message_id=payload.source_message_id,
        customer_name=payload.customer_name,
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        intent_summary=payload.intent_summary,
    )
    db.add(lead)
    await db.flush()
    telegram_enabled = await db.scalar(
        select(TelegramConnection.id).where(
            TelegramConnection.organization_id == chatbot.organization_id,
            TelegramConnection.is_enabled.is_(True),
            TelegramConnection.verified_at.is_not(None),
        )
    )
    if telegram_enabled:
        db.add(
            NotificationLog(
                organization_id=chatbot.organization_id,
                lead_id=lead.id,
                channel="TELEGRAM",
                deduplication_key=f"lead:{lead.id}:telegram",
            )
        )
    session.last_seen_at = datetime.now(UTC)
    return lead


async def retrieve_context(
    db: AsyncSession, organization_id: UUID, chatbot_id: UUID, question: str
) -> tuple[str, list[SourceReference]]:
    terms = sorted({word.lower() for word in question.split() if len(word) >= 3})[:8]
    if not terms:
        return "", []
    rows = (
        await db.execute(
            select(DocumentChunk.content, Document.id, Document.original_name)
            .join(Document, Document.id == DocumentChunk.document_id)
            .join(ChatbotDocument, ChatbotDocument.document_id == Document.id)
            .where(
                DocumentChunk.organization_id == organization_id,
                ChatbotDocument.organization_id == organization_id,
                ChatbotDocument.chatbot_id == chatbot_id,
                Document.status == DocumentStatus.DONE,
                or_(*(DocumentChunk.content.ilike(f"%{term}%") for term in terms)),
            )
            .limit(8)
        )
    ).all()
    context = "\n\n".join(content for content, _, _ in rows)
    unique_sources = {
        document_id: SourceReference(document_id=document_id, document_name=name)
        for _, document_id, name in rows
    }
    return context, list(unique_sources.values())


@router.post("/{public_id}/messages", response_model=PublicChatResponse)
async def send_message(
    public_id: UUID,
    payload: PublicChatRequest,
    response: Response,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: AsyncSession = Depends(get_db),
    redis: RedisLike = Depends(get_redis),
    gemini: GeminiService = Depends(get_gemini_service),
):
    session, chatbot, conversation = await verified_session(db, public_id, visitor_token)
    quota = QuotaService(redis)
    try:
        visitor_requests = await quota.consume_visitor_rate(str(session.id))
        if visitor_requests > 30:
            raise HTTPException(
                status_code=429,
                detail="Bạn đang gửi tin nhắn quá nhanh",
                headers={"Retry-After": "60"},
            )
        plan = (
            await db.execute(
                select(Plan)
                .join(Subscription, Subscription.plan_id == Plan.id)
                .where(
                    Subscription.organization_id == chatbot.organization_id,
                    Subscription.is_active.is_(True),
                    or_(
                        Subscription.ends_at.is_(None),
                        Subscription.ends_at > datetime.now(UTC),
                    ),
                )
                .order_by(Subscription.starts_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        result = await quota.consume_daily(
            str(chatbot.organization_id), plan.daily_chat_limit if plan else 20
        )
    except QuotaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if result.limit is not None and result.used > result.limit:
        retry_after = max(
            1, int((result.reset_at - datetime.now(result.reset_at.tzinfo)).total_seconds())
        )
        raise HTTPException(
            status_code=429,
            detail="Doanh nghiệp đã sử dụng hết quota chat hôm nay",
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(result.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(result.reset_at.timestamp())),
            },
        )

    response.headers["X-RateLimit-Limit"] = (
        str(result.limit) if result.limit is not None else "unlimited"
    )
    response.headers["X-RateLimit-Remaining"] = (
        str(result.remaining) if result.remaining is not None else "unlimited"
    )
    response.headers["X-RateLimit-Reset"] = str(int(result.reset_at.timestamp()))

    context, sources = await retrieve_context(
        db, chatbot.organization_id, chatbot.id, payload.message
    )
    try:
        reply = await gemini.generate(question=payload.message, context=context, tone=chatbot.tone)
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db.add_all(
        [
            Message(
                organization_id=chatbot.organization_id,
                conversation_id=conversation.id,
                role=MessageRole.USER,
                content=payload.message,
            ),
            Message(
                organization_id=chatbot.organization_id,
                conversation_id=conversation.id,
                role=MessageRole.ASSISTANT,
                content=reply,
                source_metadata=json.dumps([source.model_dump(mode="json") for source in sources]),
            ),
            UsageLog(
                organization_id=chatbot.organization_id,
                chatbot_id=chatbot.id,
                event_type="CHAT_MESSAGE",
            ),
        ]
    )
    session.last_seen_at = datetime.now(UTC)
    return PublicChatResponse(
        reply=reply,
        conversation_id=conversation.id,
        remaining_daily=result.remaining,
        reset_at=result.reset_at,
        sources=sources,
    )
