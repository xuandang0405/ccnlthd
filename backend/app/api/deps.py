from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.mongodb import MongoRecord, get_mongo_db, record
from app.core.security import decode_access_token, ensure_utc

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user: MongoRecord
    organization: MongoRecord
    membership: MongoRecord


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Any = Depends(get_mongo_db),
) -> MongoRecord:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập")
    try:
        user_id, session_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    session = await db.refresh_sessions.find_one({"_id": str(session_id)})
    user_document = await db.users.find_one({"_id": str(user_id)})
    if (
        not session
        or session.get("user_id") != str(user_id)
        or session.get("revoked_at") is not None
        or ensure_utc(session["expires_at"]) <= datetime.now(UTC)
        or not user_document
        or not user_document.get("is_active", False)
    ):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    return record(user_document)


async def get_tenant_context(
    x_organization_id: UUID = Header(alias="X-Organization-ID"),
    user: MongoRecord = Depends(get_current_user),
    db: Any = Depends(get_mongo_db),
) -> TenantContext:
    organization_id = str(x_organization_id)
    membership_document = await db.organization_members.find_one(
        {"organization_id": organization_id, "user_id": str(user.id)}
    )
    organization_document = await db.organizations.find_one(
        {"_id": organization_id, "is_active": True}
    )
    if membership_document is None or organization_document is None:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập doanh nghiệp")
    return TenantContext(
        user=user,
        organization=record(organization_document),
        membership=record(membership_document),
    )


async def get_super_admin(user: MongoRecord = Depends(get_current_user)) -> MongoRecord:
    if not user.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên hệ thống được truy cập")
    return user
