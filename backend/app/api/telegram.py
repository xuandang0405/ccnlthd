import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import get_db
from app.core.security import digest_token, ensure_utc
from app.integrations.telegram import TelegramService
from app.models.entities import MemberRole, TelegramConnection
from app.schemas.telegram import (
    TelegramChallengeRequest,
    TelegramConfirmRequest,
    TelegramStatus,
)

router = APIRouter(prefix="/telegram", tags=["Telegram"])


def get_telegram_service() -> TelegramService:
    return TelegramService()


def require_owner(context: TenantContext) -> None:
    if context.membership.role != MemberRole.BUSINESS_OWNER:
        raise HTTPException(status_code=403, detail="Chỉ chủ doanh nghiệp được cấu hình Telegram")


def status_for(connection: TelegramConnection | None) -> TelegramStatus:
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
    context: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)
):
    connection = await db.scalar(
        select(TelegramConnection).where(
            TelegramConnection.organization_id == context.organization.id
        )
    )
    return status_for(connection)


@router.post("/challenge", status_code=status.HTTP_202_ACCEPTED)
async def create_challenge(
    payload: TelegramChallengeRequest,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    telegram: TelegramService = Depends(get_telegram_service),
):
    require_owner(context)
    code = f"{secrets.randbelow(1_000_000):06d}"
    await telegram.send_message(
        payload.chat_id,
        f"Mã xác minh AI Sales Assistant: {code}. Mã hết hạn sau 10 phút.",
    )
    connection = await db.scalar(
        select(TelegramConnection).where(
            TelegramConnection.organization_id == context.organization.id
        )
    )
    if connection is None:
        connection = TelegramConnection(organization_id=context.organization.id)
        db.add(connection)
    connection.pending_chat_id = payload.chat_id
    connection.verification_digest = digest_token(code)
    connection.verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    connection.is_enabled = False
    return {"detail": "Mã xác minh đã được gửi tới Telegram"}


@router.post("/confirm", response_model=TelegramStatus)
async def confirm_challenge(
    payload: TelegramConfirmRequest,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    require_owner(context)
    connection = await db.scalar(
        select(TelegramConnection).where(
            TelegramConnection.organization_id == context.organization.id
        )
    )
    if (
        connection is None
        or not connection.verification_digest
        or not connection.verification_expires_at
        or ensure_utc(connection.verification_expires_at) <= datetime.now(UTC)
        or not secrets.compare_digest(connection.verification_digest, digest_token(payload.code))
    ):
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    connection.chat_id = connection.pending_chat_id
    connection.pending_chat_id = None
    connection.verification_digest = None
    connection.verification_expires_at = None
    connection.verified_at = datetime.now(UTC)
    connection.is_enabled = True
    return status_for(connection)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def disable_telegram(
    context: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)
):
    require_owner(context)
    connection = await db.scalar(
        select(TelegramConnection).where(
            TelegramConnection.organization_id == context.organization.id
        )
    )
    if connection:
        connection.is_enabled = False
