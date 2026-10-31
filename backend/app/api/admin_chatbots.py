"""API quản trị chatbot của mọi doanh nghiệp trong hệ thống."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_common import organization_names
from app.api.deps import get_super_admin
from app.core.database import get_db
from app.core.records import add_record, make_record, update_record
from app.models.entities import AuditLog, Chatbot, Organization, OrganizationMember, User
from app.schemas.admin import (
    AdminChatbot,
    AdminCreditAdjustment,
)
from app.schemas.chatbot import ChatbotUpdate

router = APIRouter()


@router.get("/chatbots", response_model=list[AdminChatbot])
async def all_chatbots(
    _: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
    search: str = Query(default="", max_length=100),
):
    names = await organization_names(db)
    query = (
        (
            or_(
                (Chatbot.name.icontains(search.strip(), autoescape=True)),
                (Chatbot.public_id == search.strip()),
            )
        )
        if search.strip()
        else true()
    )
    documents = (
        await db.scalars(
            select(Chatbot)
            .where(query)
            .order_by(Chatbot.created_at.desc())
            .limit(500)
            .execution_options(populate_existing=True)
        )
    ).all()
    memberships = (
        await db.scalars(
            select(OrganizationMember)
            .where(OrganizationMember.role == "BUSINESS_OWNER")
            .execution_options(populate_existing=True)
        )
    ).all()
    user_ids = [member["user_id"] for member in memberships]
    owners = {
        item["id"]: item["email"]
        for item in (
            await db.scalars(
                select(User).where(User.id.in_(user_ids)).execution_options(populate_existing=True)
            )
        ).all()
    }
    owner_emails: dict[str, list[str]] = {}
    for member in memberships:
        if email := owners.get(member["user_id"]):
            owner_emails.setdefault(member["organization_id"], []).append(email)
    return [
        {
            "id": item["id"],
            "organization_id": item["organization_id"],
            "organization_name": names.get(item["organization_id"], "—"),
            "owner_emails": owner_emails.get(item["organization_id"], []),
            "name": item["name"],
            "public_id": item["public_id"],
            "description": item.get("description"),
            "greeting": item.get("greeting", ""),
            "tone": item.get("tone", "professional"),
            "primary_color": item.get("primary_color", "#2563eb"),
            "is_active": item.get("is_active", True),
            "credit_balance": item.get("credit_balance", 0),
            "usage_count": item.get("usage_count", 0),
            "created_at": item["created_at"],
        }
        for item in documents
    ]


async def _admin_chatbot(db: AsyncSession, chatbot_id: str) -> dict:
    item = await db.scalar(
        select(Chatbot)
        .where(Chatbot.id == chatbot_id)
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    organization = await db.scalar(
        select(Organization)
        .where(Organization.id == item["organization_id"])
        .limit(1)
        .execution_options(populate_existing=True)
    )
    memberships = (
        await db.scalars(
            select(OrganizationMember)
            .where(
                and_(
                    OrganizationMember.organization_id == item["organization_id"],
                    OrganizationMember.role == "BUSINESS_OWNER",
                )
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    owners = (
        await db.scalars(
            select(User)
            .where(User.id.in_([member["user_id"] for member in memberships]))
            .execution_options(populate_existing=True)
        )
    ).all()
    return {
        "id": chatbot_id,
        "organization_id": item["organization_id"],
        "organization_name": organization["name"] if organization else "—",
        "owner_emails": [owner["email"] for owner in owners],
        "name": item["name"],
        "public_id": item["public_id"],
        "description": item.get("description"),
        "greeting": item.get("greeting", ""),
        "tone": item.get("tone", "professional"),
        "primary_color": item.get("primary_color", "#2563eb"),
        "is_active": item.get("is_active", True),
        "credit_balance": item.get("credit_balance", 0),
        "usage_count": item.get("usage_count", 0),
        "created_at": item["created_at"],
    }


@router.patch("/chatbots/{chatbot_id}", response_model=AdminChatbot)
async def set_chatbot_state(
    chatbot_id: UUID,
    payload: ChatbotUpdate,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    values = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(status_code=422, detail="Chưa có thông tin cần cập nhật")
    result = await db.execute(
        update(Chatbot)
        .where(Chatbot.id == str(chatbot_id))
        .values(**{**{**values, "updated_at": datetime.now(UTC)}})
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    await add_record(
        db,
        AuditLog,
        make_record(
            actor_user_id=str(admin.id),
            action="ADMIN_CHATBOT_UPDATED",
            resource_type="chatbot",
            resource_id=str(chatbot_id),
            metadata_redacted=json.dumps(values),
        ),
    )
    return await _admin_chatbot(db, str(chatbot_id))


@router.post("/chatbots/{chatbot_id}/credits", response_model=AdminChatbot)
async def adjust_chatbot_credits(
    chatbot_id: UUID,
    payload: AdminCreditAdjustment,
    admin: Any = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    if payload.amount == 0:
        raise HTTPException(status_code=422, detail="Số lượt phải khác 0")
    chatbot_id_value = str(chatbot_id)
    now = datetime.now(UTC)
    async with db.begin_nested():
        chatbot = await update_record(
            db,
            Chatbot,
            and_(
                Chatbot.id == chatbot_id_value,
                ((Chatbot.credit_balance >= -payload.amount) if payload.amount < 0 else true()),
            ),
            values={"updated_at": now},
            increments={"credit_balance": payload.amount},
        )
        if chatbot is None:
            if await db.scalar(
                select(Chatbot)
                .where(Chatbot.id == chatbot_id_value)
                .limit(1)
                .execution_options(populate_existing=True)
            ):
                raise HTTPException(status_code=409, detail="Chatbot không đủ lượt để thu hồi")
            raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
        await add_record(
            db,
            AuditLog,
            make_record(
                organization_id=chatbot["organization_id"],
                actor_user_id=str(admin.id),
                action="ADMIN_CHATBOT_CREDITS_ADJUSTED",
                resource_type="chatbot",
                resource_id=chatbot_id_value,
                metadata_redacted=json.dumps(
                    {"amount": payload.amount, "reason": payload.reason.strip()}
                ),
            ),
        )
    return await _admin_chatbot(db, chatbot_id_value)
