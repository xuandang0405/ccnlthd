import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context
from app.core.mongodb import get_mongo_db, new_document, record
from app.core.security import digest_token, ensure_utc
from app.integrations.telegram import TelegramService
from app.models.entities import MemberRole
from app.schemas.telegram import TelegramChallengeRequest, TelegramConfirmRequest, TelegramStatus

router = APIRouter(prefix="/telegram", tags=["Telegram"])


def get_telegram_service() -> TelegramService:
    return TelegramService()


def require_owner(context: TenantContext) -> None:
    if context.membership.role != MemberRole.BUSINESS_OWNER:
        raise HTTPException(status_code=403, detail="Chỉ chủ doanh nghiệp được cấu hình Telegram")


def status_for(connection: Any | None) -> TelegramStatus:
    chat_id = connection.chat_id if connection else None
    hint = f"***{chat_id[-4:]}" if chat_id else None
    return TelegramStatus(
        configured=bool(connection and connection.verified_at),
        enabled=bool(connection and connection.is_enabled),
        chat_id_hint=hint,
        verified_at=connection.verified_at if connection else None,
    )


@router.get("/status", response_model=TelegramStatus)
async def telegram_status(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    connection = record(
        await db.telegram_connections.find_one({"organization_id": str(context.organization.id)})
    )
    return status_for(connection)


@router.post("/challenge", status_code=status.HTTP_202_ACCEPTED)
async def create_challenge(
    payload: TelegramChallengeRequest,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
    telegram: TelegramService = Depends(get_telegram_service),
):
    require_owner(context)
    code = f"{secrets.randbelow(1_000_000):06d}"
    await telegram.send_message(
        payload.chat_id, f"Mã xác minh AI Sales Assistant: {code}. Mã hết hạn sau 10 phút."
    )
    now = datetime.now(UTC)
    inserted = new_document(organization_id=str(context.organization.id))
    inserted.pop("updated_at")
    await db.telegram_connections.update_one(
        {"organization_id": str(context.organization.id)},
        {
            "$set": {
                "pending_chat_id": payload.chat_id,
                "verification_digest": digest_token(code),
                "verification_expires_at": now + timedelta(minutes=10),
                "is_enabled": False,
                "updated_at": now,
            },
            "$setOnInsert": inserted,
        },
        upsert=True,
    )
    return {"detail": "Mã xác minh đã được gửi tới Telegram"}


@router.post("/confirm", response_model=TelegramStatus)
async def confirm_challenge(
    payload: TelegramConfirmRequest,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    require_owner(context)
    query = {"organization_id": str(context.organization.id)}
    connection = await db.telegram_connections.find_one(query)
    if (
        connection is None
        or not connection.get("verification_digest")
        or not connection.get("verification_expires_at")
        or ensure_utc(connection["verification_expires_at"]) <= datetime.now(UTC)
        or not secrets.compare_digest(connection["verification_digest"], digest_token(payload.code))
    ):
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    now = datetime.now(UTC)
    await db.telegram_connections.update_one(
        query,
        {
            "$set": {
                "chat_id": connection.get("pending_chat_id"),
                "pending_chat_id": None,
                "verification_digest": None,
                "verification_expires_at": None,
                "verified_at": now,
                "is_enabled": True,
                "updated_at": now,
            }
        },
    )
    return status_for(record(await db.telegram_connections.find_one(query)))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def disable_telegram(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    require_owner(context)
    await db.telegram_connections.update_one(
        {"organization_id": str(context.organization.id)},
        {"$set": {"is_enabled": False, "updated_at": datetime.now(UTC)}},
    )
