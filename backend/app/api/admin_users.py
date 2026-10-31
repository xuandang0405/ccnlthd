"""API quản trị tài khoản người dùng, số lượt và số chatbot được tạo."""

import json
import secrets
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select, true, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_common import organization_names
from app.api.deps import get_super_admin
from app.core.database import get_db
from app.core.records import add_record, make_record, update_record
from app.core.security import hash_password_async
from app.models.entities import (
    AuditLog,
    Chatbot,
    OrganizationCredit,
    OrganizationLimit,
    OrganizationMember,
    RefreshSession,
    User,
)
from app.schemas.admin import (
    AdminSlotAdjustment,
    AdminUser,
    AdminUserCreditAdjustment,
    UserStateUpdate,
)
from app.services.credits import ensure_credit_account, ensure_organization_limits

router = APIRouter()


@router.get("/users", response_model=list[AdminUser])
async def users(
    limit: int = Query(default=200, ge=1, le=500),
    search: str = Query(default="", max_length=100),
    _: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    names = await organization_names(db)
    query = (
        (
            or_(
                (User.email.icontains(search.strip(), autoescape=True)),
                (User.full_name.icontains(search.strip(), autoescape=True)),
            )
        )
        if search.strip()
        else true()
    )
    documents = (
        await db.scalars(
            select(User)
            .where(query)
            .order_by(User.created_at.desc())
            .limit(limit)
            .execution_options(populate_existing=True)
        )
    ).all()
    memberships = (
        await db.scalars(
            select(OrganizationMember).where(true()).execution_options(populate_existing=True)
        )
    ).all()
    credits = (
        await db.scalars(
            select(OrganizationCredit).where(true()).execution_options(populate_existing=True)
        )
    ).all()
    by_organization = {item["organization_id"]: item for item in credits}
    limits = (
        await db.scalars(
            select(OrganizationLimit).where(true()).execution_options(populate_existing=True)
        )
    ).all()
    limits_by_organization = {item["organization_id"]: item for item in limits}
    bots = (
        await db.scalars(select(Chatbot).where(true()).execution_options(populate_existing=True))
    ).all()
    chatbot_counts: dict[str, int] = {}
    for bot in bots:
        chatbot_counts[bot["organization_id"]] = chatbot_counts.get(bot["organization_id"], 0) + 1
    by_user: dict[str, list[dict[str, Any]]] = {}
    for item in memberships:
        organization_id = item["organization_id"]
        balance = by_organization.get(organization_id, {})
        by_user.setdefault(item["user_id"], []).append(
            {
                "id": organization_id,
                "name": names.get(organization_id, "—"),
                "free_remaining": int(balance.get("free_remaining", 0)),
                "purchased_remaining": int(balance.get("purchased_remaining", 0)),
                "chatbot_slots": int(
                    limits_by_organization.get(organization_id, {}).get("chatbot_slots", 1)
                ),
                "chatbot_count": chatbot_counts.get(organization_id, 0),
            }
        )
    return [
        {
            "id": item["id"],
            "email": item["email"],
            "full_name": item["full_name"],
            "is_active": item.get("is_active", True),
            "is_super_admin": item.get("is_super_admin", False),
            "organizations": [account["name"] for account in by_user.get(item["id"], [])],
            "organization_accounts": by_user.get(item["id"], []),
            "created_at": item["created_at"],
        }
        for item in documents
    ]


@router.patch("/users/{user_id}", response_model=AdminUser)
async def set_user_state(
    user_id: UUID,
    payload: UserStateUpdate,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    values = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(status_code=422, detail="Chưa có thông tin cần cập nhật")
    if str(admin.id) == str(user_id) and values.get("is_active") is False:
        raise HTTPException(status_code=409, detail="Không thể tự vô hiệu hóa tài khoản Admin")
    if str(admin.id) == str(user_id) and values.get("is_super_admin") is False:
        raise HTTPException(status_code=409, detail="Không thể tự tước quyền Admin")
    if "full_name" in values:
        values["full_name"] = values["full_name"].strip()
        if len(values["full_name"]) < 2:
            raise HTTPException(status_code=422, detail="Tên phải có ít nhất 2 ký tự")
    if "email" in values:
        values["email"] = values["email"].lower()
    now = datetime.now(UTC)
    try:
        result = await db.execute(
            update(User).where(User.id == str(user_id)).values(**{**{**values, "updated_at": now}})
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Email đã được sử dụng") from exc
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if values.get("is_active") is False:
        await db.execute(
            update(RefreshSession)
            .where(
                and_(RefreshSession.user_id == str(user_id), RefreshSession.revoked_at.is_(None))
            )
            .values(**{**{"revoked_at": now}})
        )
    await add_record(
        db,
        AuditLog,
        make_record(
            actor_user_id=str(admin.id),
            action="ADMIN_USER_UPDATED",
            resource_type="user",
            resource_id=str(user_id),
            metadata_redacted=json.dumps(values),
        ),
    )
    return await _admin_user(db, str(user_id))


async def _admin_user(db: AsyncSession, user_id: str) -> dict:
    item = await db.scalar(
        select(User).where(User.id == user_id).limit(1).execution_options(populate_existing=True)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    names = await organization_names(db)
    memberships = (
        await db.scalars(
            select(OrganizationMember)
            .where(OrganizationMember.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).all()
    organization_ids = [member["organization_id"] for member in memberships]
    balances = (
        await db.scalars(
            select(OrganizationCredit)
            .where(OrganizationCredit.organization_id.in_(organization_ids))
            .execution_options(populate_existing=True)
        )
    ).all()
    by_organization = {balance["organization_id"]: balance for balance in balances}
    limits = (
        await db.scalars(
            select(OrganizationLimit)
            .where(OrganizationLimit.organization_id.in_(organization_ids))
            .execution_options(populate_existing=True)
        )
    ).all()
    limits_by_organization = {limit["organization_id"]: limit for limit in limits}
    accounts = [
        {
            "id": org_id,
            "name": names.get(org_id, "—"),
            "free_remaining": int(by_organization.get(org_id, {}).get("free_remaining", 0)),
            "purchased_remaining": int(
                by_organization.get(org_id, {}).get("purchased_remaining", 0)
            ),
            "chatbot_slots": int(limits_by_organization.get(org_id, {}).get("chatbot_slots", 1)),
            "chatbot_count": await db.scalar(
                select(func.count()).select_from(Chatbot).where(Chatbot.organization_id == org_id)
            ),
        }
        for org_id in organization_ids
    ]
    return {
        "id": item["id"],
        "email": item["email"],
        "full_name": item["full_name"],
        "is_active": item.get("is_active", True),
        "is_super_admin": item.get("is_super_admin", False),
        "organizations": [account["name"] for account in accounts],
        "organization_accounts": accounts,
        "created_at": item["created_at"],
    }


@router.post("/users/{user_id}/credits")
async def adjust_user_credits(
    user_id: UUID,
    payload: AdminUserCreditAdjustment,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số lượt phải khác 0")
    user_id_value = str(user_id)
    organization_id = str(payload.organization_id)
    member = await db.scalar(
        select(OrganizationMember)
        .where(
            and_(
                OrganizationMember.user_id == user_id_value,
                OrganizationMember.organization_id == organization_id,
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not member:
        raise HTTPException(status_code=404, detail="Người dùng không thuộc doanh nghiệp này")
    await ensure_credit_account(db, organization_id)
    now = datetime.now(UTC)
    async with db.begin_nested():
        account = await update_record(
            db,
            OrganizationCredit,
            and_(
                OrganizationCredit.organization_id == organization_id,
                (
                    (OrganizationCredit.purchased_remaining >= -payload.amount)
                    if payload.amount < 0
                    else true()
                ),
            ),
            values={"updated_at": now},
            increments={"purchased_remaining": payload.amount},
        )
        if account is None:
            raise HTTPException(status_code=409, detail="Ví chung không đủ lượt để thu hồi")
        await add_record(
            db,
            AuditLog,
            make_record(
                organization_id=organization_id,
                actor_user_id=str(admin.id),
                action="ADMIN_USER_CREDITS_ADJUSTED",
                resource_type="user",
                resource_id=user_id_value,
                metadata_redacted=json.dumps(
                    {"amount": payload.amount, "reason": payload.reason.strip()}
                ),
            ),
        )
    return {
        "organization_id": organization_id,
        "purchased_remaining": account["purchased_remaining"],
    }


@router.post("/users/{user_id}/slots")
async def adjust_user_slots(
    user_id: UUID,
    payload: AdminSlotAdjustment,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số vị trí phải khác 0")
    organization_id = str(payload.organization_id)
    member = await db.scalar(
        select(OrganizationMember)
        .where(
            and_(
                OrganizationMember.user_id == str(user_id),
                OrganizationMember.organization_id == organization_id,
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Người dùng không thuộc doanh nghiệp này")
    await ensure_organization_limits(db, organization_id)
    chatbot_count = await db.scalar(
        select(func.count()).select_from(Chatbot).where(Chatbot.organization_id == organization_id)
    )
    minimum = max(1, chatbot_count) - payload.amount
    now = datetime.now(UTC)
    async with db.begin_nested():
        limits = await update_record(
            db,
            OrganizationLimit,
            and_(
                OrganizationLimit.organization_id == organization_id,
                ((OrganizationLimit.chatbot_slots >= minimum) if payload.amount < 0 else true()),
            ),
            values={"updated_at": now},
            increments={"chatbot_slots": payload.amount},
        )
        if limits is None:
            raise HTTPException(
                status_code=409, detail="Không thể thu hồi dưới số chatbot đang dùng"
            )
        await add_record(
            db,
            AuditLog,
            make_record(
                organization_id=organization_id,
                actor_user_id=str(admin.id),
                action="ADMIN_CHATBOT_SLOTS_ADJUSTED",
                resource_type="user",
                resource_id=str(user_id),
                metadata_redacted=json.dumps(
                    {"amount": payload.amount, "reason": payload.reason.strip()}
                ),
            ),
        )
    return {"organization_id": organization_id, "chatbot_slots": limits["chatbot_slots"]}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    if str(user_id) == str(admin.id):
        raise HTTPException(status_code=409, detail="Không thể tự đặt lại mật khẩu Admin tại đây")
    temporary_password = "aA1" + secrets.token_urlsafe(18)
    encoded_password = await hash_password_async(temporary_password)
    now = datetime.now(UTC)
    async with db.begin_nested():
        result = await db.execute(
            update(User)
            .where(User.id == str(user_id))
            .values(**{**{"password_hash": encoded_password, "updated_at": now}})
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        await db.execute(
            update(RefreshSession)
            .where(
                and_(RefreshSession.user_id == str(user_id), RefreshSession.revoked_at.is_(None))
            )
            .values(**{**{"revoked_at": now}})
        )
        await add_record(
            db,
            AuditLog,
            make_record(
                actor_user_id=str(admin.id),
                action="ADMIN_USER_PASSWORD_RESET",
                resource_type="user",
                resource_id=str(user_id),
                metadata_redacted="{}",
            ),
        )
    return {"temporary_password": temporary_password}
