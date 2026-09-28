from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base, get_db
from app.core.security import decode_access_token, session_expiration
from app.models.entities import Organization, OrganizationMember, RefreshSession, User

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user: Base
    organization: Base
    membership: Base


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> Base:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập")
    try:
        user_id, session_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    session = await db.scalar(
        select(RefreshSession)
        .where(RefreshSession.id == str(session_id))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    user_document = await db.scalar(
        select(User)
        .where(User.id == str(user_id))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if (
        not session
        or session.get("user_id") != str(user_id)
        or session.get("revoked_at") is not None
        or session_expiration(session) <= datetime.now(UTC)
        or not user_document
        or not user_document.get("is_active", False)
    ):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    return user_document


async def get_tenant_context(
    x_organization_id: UUID = Header(alias="X-Organization-ID"),
    user: Base = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TenantContext:
    organization_id = str(x_organization_id)
    membership_document = await db.scalar(
        select(OrganizationMember)
        .where(
            and_(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == str(user.id),
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    organization_document = await db.scalar(
        select(Organization)
        .where(and_(Organization.id == organization_id, Organization.is_active.is_(True)))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if membership_document is None or organization_document is None:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập doanh nghiệp")
    return TenantContext(
        user=user,
        organization=organization_document,
        membership=membership_document,
    )


async def get_super_admin(user: Base = Depends(get_current_user)) -> Base:
    if not user.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên hệ thống được truy cập")
    return user
