from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.records import make_record, update_record
from app.models.entities import Chatbot, OrganizationCredit, OrganizationLimit


class CreditUnavailableError(RuntimeError):
    pass


async def ensure_credit_account(db: AsyncSession, organization_id: str) -> OrganizationCredit:
    return await update_record(
        db,
        OrganizationCredit,
        OrganizationCredit.organization_id == organization_id,
        defaults=make_record(
            organization_id=organization_id, free_remaining=20, purchased_remaining=0
        ),
    )


async def ensure_organization_limits(db: AsyncSession, organization_id: str) -> OrganizationLimit:
    return await update_record(
        db,
        OrganizationLimit,
        OrganizationLimit.organization_id == organization_id,
        defaults=make_record(organization_id=organization_id, chatbot_slots=1),
    )


@dataclass(frozen=True)
class CreditResult:
    source: str
    remaining: int


async def consume_credit(db: AsyncSession, organization_id: str, chatbot_id: str) -> CreditResult:
    # Các luồng chuyển lượt đều khóa ví trước rồi mới khóa chatbot để tránh deadlock.
    account = await ensure_credit_account(db, organization_id)
    chatbot = await db.scalar(
        select(Chatbot)
        .where(Chatbot.id == chatbot_id, Chatbot.organization_id == organization_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if chatbot is None:
        raise CreditUnavailableError("Chatbot không còn tồn tại")
    if chatbot.credit_balance > 0:
        chatbot.credit_balance -= 1
        result = CreditResult(source="CHATBOT", remaining=chatbot.credit_balance)
    elif account.free_remaining > 0:
        account.free_remaining -= 1
        result = CreditResult(source="FREE", remaining=account.free_remaining)
    else:
        raise CreditUnavailableError(
            "Đã hết lượt chat. Vui lòng mua thêm lượt và phân bổ cho chatbot."
        )
    chatbot.usage_count += 1
    # Không giữ khóa MySQL trong lúc chờ Gemini trả lời.
    await db.commit()
    return result


async def refund_credit(
    db: AsyncSession, organization_id: str, chatbot_id: str, source: str
) -> int:
    account = await ensure_credit_account(db, organization_id)
    chatbot = await db.scalar(
        select(Chatbot)
        .where(Chatbot.id == chatbot_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if source == "CHATBOT" and chatbot is not None:
        chatbot.credit_balance += 1
        remaining = chatbot.credit_balance
    elif source == "CHATBOT":
        # Chatbot bị xóa khi Gemini đang chạy: hoàn lượt đã trả tiền về ví chung.
        account.purchased_remaining += 1
        remaining = account.purchased_remaining
    else:
        account.free_remaining += 1
        remaining = account.free_remaining
    if chatbot is not None:
        chatbot.usage_count = max(0, chatbot.usage_count - 1)
    await db.commit()
    return remaining
