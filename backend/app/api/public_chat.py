import json
import re
import secrets
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response

from app.core.mongodb import get_mongo_db, new_document, record
from app.core.redis import RedisLike, get_redis
from app.core.security import digest_token, ensure_utc
from app.integrations.gemini import GeminiService, GeminiServiceError
from app.models.entities import DocumentStatus, LeadStatus, MessageRole
from app.schemas.operations import LeadResponse, PublicLeadCreate
from app.schemas.public_chat import (
    PublicChatRequest,
    PublicChatResponse,
    SourceReference,
    VisitorSessionResponse,
)
from app.services.credits import CreditUnavailableError, consume_credit, refund_credit
from app.services.documents import normalize_search_text, search_tokens
from app.services.fallback_chat import build_fallback_reply
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


async def active_chatbot(db: Any, public_id: UUID):
    chatbot = await db.chatbots.find_one({"public_id": str(public_id), "is_active": True})
    if chatbot is None:
        raise HTTPException(status_code=404, detail="Chatbot không tồn tại hoặc đã tắt")
    return record(chatbot)


@router.post("/{public_id}/sessions", response_model=VisitorSessionResponse, status_code=201)
async def create_visitor_session(
    public_id: UUID,
    request: Request,
    widget_origin: str | None = Header(default=None, alias="X-Widget-Origin"),
    db: Any = Depends(get_mongo_db),
):
    chatbot = await active_chatbot(db, public_id)
    claimed_origin = widget_origin or request.headers.get("origin")
    if not origin_allowed(claimed_origin, chatbot.allowed_domains):
        raise HTTPException(status_code=403, detail="Domain không được phép nhúng chatbot")
    token = secrets.token_urlsafe(40)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    visitor = new_document(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        token_digest=digest_token(token),
        expires_at=expires_at,
        last_seen_at=datetime.now(UTC),
    )
    conversation = new_document(
        organization_id=chatbot.organization_id,
        chatbot_id=chatbot.id,
        visitor_session_id=visitor["_id"],
        status="OPEN",
    )
    await db.visitor_sessions.insert_one(visitor)
    await db.conversations.insert_one(conversation)
    return VisitorSessionResponse(
        visitor_token=token,
        conversation_id=conversation["_id"],
        greeting=chatbot.greeting,
        primary_color=chatbot.primary_color,
        expires_at=expires_at,
    )


async def verified_session(db: Any, public_id: UUID, visitor_token: str):
    visitor = await db.visitor_sessions.find_one({"token_digest": digest_token(visitor_token)})
    if visitor is None or ensure_utc(visitor["expires_at"]) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Phiên khách truy cập không hợp lệ")
    chatbot = await db.chatbots.find_one(
        {
            "_id": visitor["chatbot_id"],
            "public_id": str(public_id),
            "is_active": True,
        }
    )
    conversation = await db.conversations.find_one(
        {"visitor_session_id": visitor["_id"], "status": "OPEN"}, sort=[("created_at", -1)]
    )
    if chatbot is None or conversation is None:
        raise HTTPException(status_code=401, detail="Phiên khách truy cập không hợp lệ")
    return record(visitor), record(chatbot), record(conversation)


@router.post("/{public_id}/leads", response_model=LeadResponse, status_code=201)
async def create_public_lead(
    public_id: UUID,
    payload: PublicLeadCreate,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: Any = Depends(get_mongo_db),
):
    visitor, chatbot, conversation = await verified_session(db, public_id, visitor_token)
    if not payload.has_contact():
        raise HTTPException(status_code=422, detail="Cần cung cấp email hoặc số điện thoại")
    source_message_id = str(payload.source_message_id) if payload.source_message_id else None
    if source_message_id:
        message = await db.messages.find_one(
            {
                "_id": source_message_id,
                "conversation_id": conversation.id,
                "organization_id": chatbot.organization_id,
            }
        )
        if message is None:
            raise HTTPException(status_code=404, detail="Tin nhắn nguồn không hợp lệ")
        if await db.leads.find_one({"source_message_id": source_message_id}, {"_id": 1}):
            raise HTTPException(status_code=409, detail="Lead đã được ghi nhận từ tin nhắn này")
    lead = new_document(
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
    await db.leads.insert_one(lead)
    telegram_enabled = await db.telegram_connections.find_one(
        {
            "organization_id": chatbot.organization_id,
            "is_enabled": True,
            "verified_at": {"$ne": None},
        }
    )
    if telegram_enabled:
        await db.notification_logs.insert_one(
            new_document(
                organization_id=chatbot.organization_id,
                lead_id=lead["_id"],
                channel="TELEGRAM",
                deduplication_key=f"lead:{lead['_id']}:telegram",
                status="PENDING",
                attempts=0,
                last_error=None,
            )
        )
    await db.visitor_sessions.update_one(
        {"_id": visitor.id},
        {"$set": {"last_seen_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}},
    )
    return record(lead)


async def retrieve_context(db: Any, organization_id: str, chatbot_id: str, question: str):
    ignored_terms = {
        "bao", "ban", "cho", "chua", "con", "cua", "dang", "duoc", "gia", "hien",
        "khong", "minh", "nao", "nhieu", "pham", "san", "tai", "trang", "tren", "toi",
        "voi", "website",
    }
    terms = [term for term in search_tokens(question, limit=20) if term not in ignored_terms][:12]
    relations = await db.chatbot_documents.find(
        {"organization_id": organization_id, "chatbot_id": chatbot_id}, {"document_id": 1}
    ).to_list(None)
    document_ids = [item["document_id"] for item in relations]
    documents = await db.documents.find(
        {
            "_id": {"$in": document_ids},
            "organization_id": organization_id,
            "status": DocumentStatus.DONE.value,
            "approval_status": "APPROVED",
        }
    ).to_list(None)
    document_map = {item["_id"]: item for item in documents}
    if not document_map:
        return "", [], False
    rows: list[dict[str, Any]] = []
    base_filter = {
        "organization_id": organization_id,
        "document_id": {"$in": list(document_map)},
    }
    if terms:
        rows = (
            await db.document_chunks.find(
                {**base_filter, "search_tokens": {"$in": terms}}
            )
            .limit(400)
            .to_list(None)
        )
        if not rows:
            pattern = "|".join(re.escape(term) for term in terms)
            rows = (
                await db.document_chunks.find(
                    {**base_filter, "content": {"$regex": pattern, "$options": "i"}}
                )
                .limit(300)
                .to_list(None)
            )

    ranked: list[tuple[float, bool, dict[str, Any]]] = []
    for item in rows:
        content_tokens = set(search_tokens(item["content"], limit=2000))
        matched = [term for term in terms if term in content_tokens]
        if not matched:
            continue
        total_weight = sum(5 if any(char.isdigit() for char in term) else 2 for term in terms)
        matched_weight = sum(
            5 if any(char.isdigit() for char in term) else 2 for term in matched
        )
        coverage = matched_weight / total_weight if total_weight else 0
        normalized_content = item.get("search_text") or normalize_search_text(item["content"])
        adjacent_matches = sum(
            1
            for left, right in zip(terms, terms[1:], strict=False)
            if f"{left} {right}" in normalized_content
        )
        required = [term for term in terms if any(char.isdigit() for char in term)]
        confident = coverage >= 0.6 and all(term in content_tokens for term in required)
        score = coverage * 100 + adjacent_matches * 12 + (35 if len(matched) == len(terms) else 0)
        ranked.append((score, confident, item))
    ranked.sort(key=lambda entry: (-entry[0], entry[2].get("chunk_index", 0)))

    match_found = bool(ranked and ranked[0][1])
    rows = [entry[2] for entry in ranked[:6]]
    if not rows:
        rows = (
            await db.document_chunks.find(base_filter)
            .limit(4)
            .to_list(None)
        )
    context = "\n\n".join(item["content"] for item in rows)
    source_ids = list(dict.fromkeys(item["document_id"] for item in rows))
    sources = [
        SourceReference(document_id=item, document_name=document_map[item]["original_name"])
        for item in source_ids
    ]
    return context, sources, match_found


@router.post("/{public_id}/messages", response_model=PublicChatResponse)
async def send_message(
    public_id: UUID,
    payload: PublicChatRequest,
    response: Response,
    visitor_token: str = Header(alias="X-Visitor-Token"),
    db: Any = Depends(get_mongo_db),
    redis: RedisLike = Depends(get_redis),
    gemini: GeminiService = Depends(get_gemini_service),
):
    visitor, chatbot, conversation = await verified_session(db, public_id, visitor_token)
    quota = QuotaService(redis)
    try:
        visitor_requests = await quota.consume_visitor_rate(visitor.id)
        if visitor_requests > 30:
            raise HTTPException(
                status_code=429,
                detail="Bạn đang gửi tin nhắn quá nhanh",
                headers={"Retry-After": "60"},
            )
    except QuotaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        credit = await consume_credit(db, chatbot.organization_id, chatbot.id)
    except CreditUnavailableError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    response.headers["X-Credit-Remaining"] = str(credit.remaining)
    context, sources, match_found = await retrieve_context(
        db, chatbot.organization_id, chatbot.id, payload.message
    )
    try:
        reply = await gemini.generate(
            question=payload.message,
            context=context,
            tone=chatbot.tone,
            match_found=match_found,
        )
    except GeminiServiceError:
        refunded_remaining = await refund_credit(
            db, chatbot.organization_id, chatbot.id, credit.source
        )
        response.headers["X-Credit-Remaining"] = str(refunded_remaining)
        reply = build_fallback_reply(payload.message, context, match_found)
        credit = type(credit)(source=credit.source, remaining=refunded_remaining)
    now = datetime.now(UTC)
    await db.messages.insert_many(
        [
            new_document(
                organization_id=chatbot.organization_id,
                conversation_id=conversation.id,
                role=MessageRole.USER.value,
                content=payload.message,
                source_metadata=None,
            ),
            new_document(
                organization_id=chatbot.organization_id,
                conversation_id=conversation.id,
                role=MessageRole.ASSISTANT.value,
                content=reply,
                source_metadata=json.dumps([source.model_dump(mode="json") for source in sources]),
            ),
        ]
    )
    await db.usage_logs.insert_one(
        new_document(
            organization_id=chatbot.organization_id,
            chatbot_id=chatbot.id,
            event_type="CHAT_MESSAGE",
            quantity=1,
            usage_date=date.today().isoformat(),
        )
    )
    await db.visitor_sessions.update_one(
        {"_id": visitor.id}, {"$set": {"last_seen_at": now, "updated_at": now}}
    )
    await db.conversations.update_one({"_id": conversation.id}, {"$set": {"updated_at": now}})
    return PublicChatResponse(
        reply=reply,
        conversation_id=conversation.id,
        remaining_daily=credit.remaining,
        remaining_credits=credit.remaining,
        reset_at=None,
        sources=sources,
    )
