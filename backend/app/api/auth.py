import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.mongodb import MongoRecord, get_mongo_db, new_document, record
from app.core.security import (
    create_access_token,
    digest_token,
    ensure_utc,
    hash_password,
    new_refresh_token,
    verify_password,
)
from app.integrations.email import EmailConfigurationError, send_password_reset
from app.models.entities import MemberRole
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


async def issue_tokens(db: Any, user: MongoRecord, session: Any = None) -> TokenResponse:
    settings = get_settings()
    refresh_plain, refresh_digest = new_refresh_token()
    login_session = new_document(
        user_id=str(user.id),
        token_digest=refresh_digest,
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
        revoked_at=None,
    )
    await db.refresh_sessions.insert_one(login_session, session=session)
    access, expires_at = create_access_token(UUID(str(user.id)), UUID(login_session["_id"]))
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_plain,
        expires_at=expires_at,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest, db: Any = Depends(get_mongo_db)):
    email = payload.email.lower()
    free_plan = await db.plans.find_one_and_update(
        {"code": "FREE"},
        {
            "$setOnInsert": new_document(
                code="FREE",
                display_name="Miễn phí",
                daily_chat_limit=20,
                price_vnd=0,
                is_active=True,
            )
        },
        upsert=True,
        return_document=True,
    )
    suffix = uuid4().hex[:8]
    user_document = new_document(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_super_admin=False,
    )
    organization = new_document(
        name=payload.organization_name,
        slug=f"{slugify(payload.organization_name)}-{suffix}",
        is_active=True,
    )
    membership = new_document(
        organization_id=organization["_id"],
        user_id=user_document["_id"],
        role=MemberRole.BUSINESS_OWNER.value,
    )
    subscription = new_document(
        organization_id=organization["_id"],
        plan_id=free_plan["_id"],
        is_active=True,
        starts_at=datetime.now(UTC),
        ends_at=None,
    )
    credit_account = new_document(
        organization_id=organization["_id"], free_remaining=20, purchased_remaining=0
    )
    organization_limits = new_document(organization_id=organization["_id"], chatbot_slots=1)
    try:
        async with db.client.start_session() as mongo_session:
            async with await mongo_session.start_transaction():
                await db.users.insert_one(user_document, session=mongo_session)
                await db.organizations.insert_one(organization, session=mongo_session)
                await db.organization_members.insert_one(membership, session=mongo_session)
                await db.subscriptions.insert_one(subscription, session=mongo_session)
                await db.organization_credits.insert_one(credit_account, session=mongo_session)
                await db.organization_limits.insert_one(organization_limits, session=mongo_session)
                return await issue_tokens(db, record(user_document), mongo_session)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email đã được sử dụng") from exc


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: Any = Depends(get_mongo_db)):
    user_document = await db.users.find_one({"email": payload.email.lower()})
    if (
        not user_document
        or not verify_password(payload.password, user_document["password_hash"])
        or not user_document.get("is_active", False)
    ):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    return await issue_tokens(db, record(user_document))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: Any = Depends(get_mongo_db)):
    now = datetime.now(UTC)
    session = await db.refresh_sessions.find_one(
        {"token_digest": digest_token(payload.refresh_token)}
    )
    if (
        not session
        or session.get("revoked_at") is not None
        or ensure_utc(session["expires_at"]) <= now
    ):
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ")
    user_document = await db.users.find_one({"_id": session["user_id"]})
    if not user_document or not user_document.get("is_active", False):
        raise HTTPException(status_code=401, detail="Tài khoản không hợp lệ")
    await db.refresh_sessions.update_one(
        {"_id": session["_id"], "revoked_at": None}, {"$set": {"revoked_at": now}}
    )
    return await issue_tokens(db, record(user_document))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: Any = Depends(get_mongo_db)):
    await db.refresh_sessions.update_one(
        {"token_digest": digest_token(payload.refresh_token), "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC)}},
    )


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(payload: PasswordResetRequest, db: Any = Depends(get_mongo_db)):
    settings = get_settings()
    if settings.email_enabled and not all(
        [settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from]
    ):
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng")
    user_document = await db.users.find_one({"email": payload.email.lower()})
    if user_document is None or not user_document.get("is_active") or not settings.email_enabled:
        return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}
    token = secrets.token_urlsafe(40)
    await db.password_reset_tokens.insert_one(
        new_document(
            user_id=user_document["_id"],
            token_digest=digest_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
            used_at=None,
        )
    )
    reset_query = urlencode({"token": token})
    reset_url = f"{settings.frontend_origin.rstrip('/')}/reset-password?{reset_query}"
    try:
        await send_password_reset(user_document["email"], reset_url)
    except EmailConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Dịch vụ email chưa sẵn sàng") from exc
    return {"detail": "Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi"}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(payload: PasswordResetConfirm, db: Any = Depends(get_mongo_db)):
    now = datetime.now(UTC)
    reset = await db.password_reset_tokens.find_one(
        {"token_digest": digest_token(payload.token), "used_at": None}
    )
    if reset is None or ensure_utc(reset["expires_at"]) <= now:
        raise HTTPException(
            status_code=400, detail="Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
        )
    user_document = await db.users.find_one({"_id": reset["user_id"], "is_active": True})
    if user_document is None:
        raise HTTPException(status_code=400, detail="Tài khoản không hợp lệ")
    async with db.client.start_session() as mongo_session:
        async with await mongo_session.start_transaction():
            await db.users.update_one(
                {"_id": user_document["_id"]},
                {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": now}},
                session=mongo_session,
            )
            await db.password_reset_tokens.update_one(
                {"_id": reset["_id"]}, {"$set": {"used_at": now}}, session=mongo_session
            )
            await db.refresh_sessions.update_many(
                {"user_id": user_document["_id"], "revoked_at": None},
                {"$set": {"revoked_at": now}},
                session=mongo_session,
            )


@router.get("/me", response_model=CurrentUserResponse)
async def me(user: MongoRecord = Depends(get_current_user), db: Any = Depends(get_mongo_db)):
    memberships = await db.organization_members.find({"user_id": str(user.id)}).to_list(None)
    organization_ids = [membership["organization_id"] for membership in memberships]
    organizations = await db.organizations.find({"_id": {"$in": organization_ids}}).to_list(None)
    organizations_by_id = {organization["_id"]: organization for organization in organizations}
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
