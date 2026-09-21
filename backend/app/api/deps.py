from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token, ensure_utc
from app.models.entities import Organization, OrganizationMember, RefreshSession, User

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user: User
    organization: Organization
    membership: OrganizationMember


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập")
    try:
        user_id, session_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    session = await db.get(RefreshSession, session_id)
    user = await db.get(User, user_id)
    if (
        not session
        or session.revoked_at is not None
        or ensure_utc(session.expires_at) <= datetime.now(UTC)
        or not user
        or not user.is_active
    ):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    return user


async def get_tenant_context(
    x_organization_id: UUID = Header(alias="X-Organization-ID"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    stmt = (
        select(OrganizationMember, Organization)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .where(
            OrganizationMember.organization_id == x_organization_id,
            OrganizationMember.user_id == user.id,
            Organization.is_active.is_(True),
        )
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập doanh nghiệp")
    membership, organization = row
    return TenantContext(user=user, organization=organization, membership=membership)


async def get_super_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên hệ thống được truy cập")
    return user
