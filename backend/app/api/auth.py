import re
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.core.records import add_record, make_record, update_record
from app.core.security import (
    create_access_token,
    digest_token,
    ensure_utc,
    hash_password_async,
    new_refresh_token,
    session_expiration,
    verify_password_async,
)
from app.integrations.email import EmailConfigurationError, send_password_reset
from app.models.entities import (
    MemberRole,
    Organization,
    OrganizationCredit,
    OrganizationLimit,
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


async def issue_tokens(
    db: AsyncSession,
    user: Base,
    session_expires_at: datetime | None = None,
) -> TokenResponse:
    settings = get_settings()
    absolute_expiry = session_expires_at or (
        datetime.now(UTC) + timedelta(hours=settings.login_session_hours)
    )
    refresh_plain, refresh_digest = new_refresh_token()
    login_session = make_record(
        user_id=str(user.id),
        token_digest=refresh_digest,
        expires_at=absolute_expiry,
        revoked_at=None,
    )
    login_session = await add_record(db, RefreshSession, login_session)
    access, expires_at = create_access_token(UUID(str(user.id)), UUID(login_session["id"]))
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_plain,
        expires_at=expires_at,
        session_expires_at=absolute_expiry,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db, scope="function")):
    email = payload.email.lower()
    free_plan = await update_record(
        db,
        Plan,
        (Plan.code == "FREE"),
        defaults=make_record(
            code="FREE",
            display_name="Miễn phí",
            daily_chat_limit=20,
            price_vnd=0,
            is_active=True,
        ),
    )
    suffix = uuid4().hex[:8]
    user_document = make_record(
        email=email,
        full_name=payload.full_name,
        password_hash=await hash_password_async(payload.password),
        is_active=True,
        is_super_admin=False,
    )
    organization = make_record(
        name=payload.organization_name,
        slug=f"{slugify(payload.organization_name)}-{suffix}",
        is_active=True,
    )
    membership = make_record(
        organization_id=organization["id"],
        user_id=user_document["id"],
        role=MemberRole.BUSINESS_OWNER.value,
    )
    subscription = make_record(
        organization_id=organization["id"],
        plan_id=free_plan["id"],
        is_active=True,
        starts_at=datetime.now(UTC),
        ends_at=None,
    )
    credit_account = make_record(
        organization_id=organization["id"], free_remaining=20, purchased_remaining=0
    )
    organization_limits = make_record(organization_id=organization["id"], chatbot_slots=1)
    try:
        async with db.begin_nested():
            user_document = await add_record(db, User, user_document)
            organization = await add_record(db, Organization, organization)
            membership = await add_record(db, OrganizationMember, membership)
            subscription = await add_record(db, Subscription, subscription)
            credit_account = await add_record(db, OrganizationCredit, credit_account)
            organization_limits = await add_record(db, OrganizationLimit, organization_limits)
            return await issue_tokens(db, user_document)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Email đã được sử dụng") from exc


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db, scope="function")):
    user_document = await db.scalar(
        select(User)
        .where(User.email == payload.email.lower())
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if (
        not user_document
        or not await verify_password_async(payload.password, user_document["password_hash"])
        or not user_document.get("is_active", False)
    ):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    return await issue_tokens(db, user_document)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db, scope="function")):
    now = datetime.now(UTC)
    session = await db.scalar(
        select(RefreshSession)
        .where(RefreshSession.token_digest == digest_token(payload.refresh_token))
        .with_for_update()
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not session or session.get("revoked_at") is not None or session_expiration(session) <= now:
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ")
    user_document = await db.scalar(
        select(User)
        .where(User.id == session["user_id"])
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not user_document or not user_document.get("is_active", False):
        raise HTTPException(status_code=401, detail="Tài khoản không hợp lệ")
    await db.execute(
        update(RefreshSession)
        .where(and_(RefreshSession.id == session["id"], RefreshSession.revoked_at.is_(None)))
        .values(**{**{"revoked_at": now}})
    )
    return await issue_tokens(
        db,
        user_document,
        session_expires_at=session_expiration(session),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db, scope="function")):
    await db.execute(
        update(RefreshSession)
        .where(
            and_(
                RefreshSession.token_digest == digest_token(payload.refresh_token),
                RefreshSession.revoked_at.is_(None),
            )
        )
        .values(**{**{"revoked_at": datetime.now(UTC)}})
    )


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(
    payload: PasswordResetRequest, db: AsyncSession = Depends(get_db, scope="function")
):
    settings = get_settings()
    if settings.email_enabled and not all(
        [settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from]
    ):
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng")
    user_document = await db.scalar(
        select(User)
        .where(User.email == payload.email.lower())
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if user_document is None or not user_document.get("is_active") or not settings.email_enabled:
        return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}
    token = secrets.token_urlsafe(40)
    await add_record(
        db,
        PasswordResetToken,
        make_record(
            user_id=user_document["id"],
            token_digest=digest_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
            used_at=None,
        ),
    )
    reset_query = urlencode({"token": token})
    reset_url = f"{settings.frontend_origin.rstrip('/')}/reset-password?{reset_query}"
    try:
        await send_password_reset(user_document["email"], reset_url)
    except EmailConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng") from exc
    return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(
    payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db, scope="function")
):
    now = datetime.now(UTC)
    reset = await db.scalar(
        select(PasswordResetToken)
        .where(
            and_(
                PasswordResetToken.token_digest == digest_token(payload.token),
                PasswordResetToken.used_at.is_(None),
            )
        )
        .with_for_update()
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if reset is None or ensure_utc(reset["expires_at"]) <= now:
        raise HTTPException(
            status_code=400, detail="Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
        )
    user_document = await db.scalar(
        select(User)
        .where(and_(User.id == reset["user_id"], User.is_active.is_(True)))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if user_document is None:
        raise HTTPException(status_code=400, detail="Tài khoản không hợp lệ")
    encoded_password = await hash_password_async(payload.new_password)
    async with db.begin_nested():
        await db.execute(
            update(User)
            .where(User.id == user_document["id"])
            .values(**{**{"password_hash": encoded_password, "updated_at": now}})
        )
        await db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.id == reset["id"])
            .values(**{**{"used_at": now}})
        )
        await db.execute(
            update(RefreshSession)
            .where(
                and_(
                    RefreshSession.user_id == user_document["id"],
                    RefreshSession.revoked_at.is_(None),
                )
            )
            .values(**{**{"revoked_at": now}})
        )


@router.get("/me", response_model=CurrentUserResponse)
async def me(
    user: Base = Depends(get_current_user), db: AsyncSession = Depends(get_db, scope="function")
):
    memberships = (
        await db.scalars(
            select(OrganizationMember)
            .where(OrganizationMember.user_id == str(user.id))
            .execution_options(populate_existing=True)
        )
    ).all()
    organization_ids = [membership["organization_id"] for membership in memberships]
    organizations = (
        await db.scalars(
            select(Organization)
            .where(Organization.id.in_(organization_ids))
            .execution_options(populate_existing=True)
        )
    ).all()
    organizations_by_id = {organization["id"]: organization for organization in organizations}
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_super_admin=user.is_super_admin,
        organizations=[
            OrganizationSummary(
                id=membership["organization_id"],
                name=organizations_by_id[membership["organization_id"]]["name"],
                role=membership["role"],
            )
            for membership in memberships
            if membership["organization_id"] in organizations_by_id
        ],
    )
