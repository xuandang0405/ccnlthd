import re
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    digest_token,
    ensure_utc,
    hash_password,
    new_refresh_token,
    verify_password,
)
from app.integrations.email import EmailConfigurationError, send_password_reset
from app.models.entities import (
    MemberRole,
    Organization,
    OrganizationMember,
    PasswordResetToken,
    Plan,
    RefreshSession,
    Subscription,
    User,
)
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    LogoutRequest,
    OrganizationSummary,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:80] or "doanh-nghiep"


async def issue_tokens(db: AsyncSession, user: User) -> TokenResponse:
    settings = get_settings()
    refresh_plain, refresh_digest = new_refresh_token()
    login_session = RefreshSession(
        user_id=user.id,
        token_digest=refresh_digest,
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    db.add(login_session)
    await db.flush()
    access, expires_at = create_access_token(user.id, login_session.id)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_plain,
        expires_at=expires_at,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email đã được sử dụng")

    free_plan = await db.scalar(select(Plan).where(Plan.code == "FREE"))
    if free_plan is None:
        free_plan = Plan(code="FREE", display_name="Miễn phí", daily_chat_limit=20)
        db.add(free_plan)
        await db.flush()

    suffix = uuid4().hex[:8]
    user = User(
        email=email, full_name=payload.full_name, password_hash=hash_password(payload.password)
    )
    organization = Organization(
        name=payload.organization_name,
        slug=f"{slugify(payload.organization_name)}-{suffix}",
    )
    db.add_all([user, organization])
    await db.flush()
    db.add_all(
        [
            OrganizationMember(
                organization_id=organization.id,
                user_id=user.id,
                role=MemberRole.BUSINESS_OWNER,
            ),
            Subscription(organization_id=organization.id, plan_id=free_plan.id),
        ]
    )
    return await issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    return await issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    now = datetime.now(UTC)
    session = await db.scalar(
        select(RefreshSession).where(
            RefreshSession.token_digest == digest_token(payload.refresh_token)
        )
    )
    if not session or session.revoked_at is not None or ensure_utc(session.expires_at) <= now:
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ")
    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Tài khoản không hợp lệ")
    session.revoked_at = now
    return await issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db)):
    session = await db.scalar(
        select(RefreshSession).where(
            RefreshSession.token_digest == digest_token(payload.refresh_token)
        )
    )
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(
    payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    settings = get_settings()
    if settings.email_enabled and not all(
        [settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from]
    ):
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng")
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not user.is_active or not settings.email_enabled:
        return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}
    token = secrets.token_urlsafe(40)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_digest=digest_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    await db.flush()
    reset_query = urlencode({"token": token})
    reset_url = f"{settings.frontend_origin.rstrip('/')}/reset-password?{reset_query}"
    try:
        await send_password_reset(user.email, reset_url)
    except EmailConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng") from exc
    return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(
    payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)
):
    now = datetime.now(UTC)
    reset = await db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_digest == digest_token(payload.token),
            PasswordResetToken.used_at.is_(None),
        )
    )
    if reset is None or ensure_utc(reset.expires_at) <= now:
        raise HTTPException(
            status_code=400, detail="Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
        )
    user = await db.get(User, reset.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Tài khoản không hợp lệ")
    user.password_hash = hash_password(payload.new_password)
    reset.used_at = now
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )


@router.get("/me", response_model=CurrentUserResponse)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Organization, OrganizationMember.role)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(OrganizationMember.user_id == user.id)
        )
    ).all()
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_super_admin=user.is_super_admin,
        organizations=[
            OrganizationSummary(id=org.id, name=org.name, role=role.value) for org, role in rows
        ],
    )
