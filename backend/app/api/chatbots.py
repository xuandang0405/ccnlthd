from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, delete, func, select, true, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.database import Base, get_db
from app.core.records import add_record, delete_record, make_record
from app.models.entities import (
    Chatbot,
    ChatbotDocument,
    Document,
    DocumentStatus,
    OrganizationCredit,
)
from app.schemas.chatbot import (
    ChatbotCreate,
    ChatbotCreditAllocation,
    ChatbotResponse,
    ChatbotUpdate,
)
from app.services.credits import ensure_credit_account, ensure_organization_limits
from app.services.document_links import link_chatbot_to_documents

router = APIRouter(prefix="/chatbots", tags=["Chatbots"])


@router.get("", response_model=list[ChatbotResponse])
async def list_chatbots(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    documents = (
        await db.scalars(
            select(Chatbot)
            .where(Chatbot.organization_id == str(context.organization.id))
            .order_by(Chatbot.created_at.desc())
            .execution_options(populate_existing=True)
        )
    ).all()
    return [document for document in documents]


@router.post("", response_model=ChatbotResponse, status_code=201)
async def create_chatbot(
    payload: ChatbotCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    organization_id = str(context.organization.id)
    limits = await ensure_organization_limits(db, organization_id)
    chatbot_count = await db.scalar(
        select(func.count()).select_from(Chatbot).where(Chatbot.organization_id == organization_id)
    )
    if chatbot_count >= int(limits["chatbot_slots"]):
        raise HTTPException(
            status_code=402,
            detail="Gói miễn phí chỉ có 1 chatbot. Vui lòng mua thêm vị trí chatbot.",
        )
    document = make_record(
        organization_id=organization_id,
        public_id=str(uuid4()),
        **payload.model_dump(),
        avatar_url=None,
        allowed_domains="[]",
        is_active=True,
        credit_balance=0,
        usage_count=0,
    )
    document = await add_record(db, Chatbot, document)
    await link_chatbot_to_documents(
        db,
        organization_id=str(context.organization.id),
        chatbot_id=document["id"],
    )
    return document


@router.post("/{chatbot_id}/credits", response_model=ChatbotResponse)
async def allocate_chatbot_credits(
    chatbot_id: UUID,
    payload: ChatbotCreditAllocation,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    organization_id = str(context.organization.id)
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    account = await ensure_credit_account(db, organization_id)
    amount = payload.amount
    if amount > 0 and int(account.get("purchased_remaining", 0)) < amount:
        raise HTTPException(status_code=409, detail="Ví chung không đủ lượt để phân bổ")
    if amount < 0 and int(chatbot.get("credit_balance", 0)) < abs(amount):
        raise HTTPException(status_code=409, detail="Chatbot không đủ lượt để thu hồi")
    now = datetime.now(UTC)
    async with db.begin_nested():
        wallet = await db.execute(
            update(OrganizationCredit)
            .where(
                and_(
                    OrganizationCredit.organization_id == organization_id,
                    ((OrganizationCredit.purchased_remaining >= amount) if amount > 0 else true()),
                )
            )
            .values(
                **{
                    **{"updated_at": now},
                    "purchased_remaining": OrganizationCredit.purchased_remaining + -amount,
                }
            )
        )
        updated = await db.execute(
            update(Chatbot)
            .where(
                and_(
                    Chatbot.id == str(chatbot.id),
                    ((Chatbot.credit_balance >= abs(amount)) if amount < 0 else true()),
                )
            )
            .values(**{**{"updated_at": now}, "credit_balance": Chatbot.credit_balance + amount})
        )
        if not wallet.rowcount or not updated.rowcount:
            raise HTTPException(status_code=409, detail="Không thể cập nhật số lượt")
    return await db.scalar(
        select(Chatbot)
        .where(Chatbot.id == str(chatbot.id))
        .limit(1)
        .execution_options(populate_existing=True)
    )


async def owned_chatbot(db: AsyncSession, chatbot_id: UUID, organization_id: str) -> Base:
    document = await db.scalar(
        select(Chatbot)
        .where(and_(Chatbot.id == str(chatbot_id), Chatbot.organization_id == str(organization_id)))
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
    return document


@router.get("/{chatbot_id}", response_model=ChatbotResponse)
async def get_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    return await owned_chatbot(db, chatbot_id, context.organization.id)


@router.patch("/{chatbot_id}", response_model=ChatbotResponse)
async def update_chatbot(
    chatbot_id: UUID,
    payload: ChatbotUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    values = payload.model_dump(exclude_unset=True)
    values["updated_at"] = datetime.now(UTC)
    await db.execute(update(Chatbot).where(Chatbot.id == str(chatbot.id)).values(**{**values}))
    return await db.scalar(
        select(Chatbot)
        .where(Chatbot.id == str(chatbot.id))
        .limit(1)
        .execution_options(populate_existing=True)
    )


@router.delete("/{chatbot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chatbot(
    chatbot_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    chatbot_id_value = str(chatbot.id)
    organization_id = str(context.organization.id)
    await ensure_credit_account(db, organization_id)
    async with db.begin_nested():
        deleted = await delete_record(
            db,
            Chatbot,
            and_(Chatbot.id == chatbot_id_value, Chatbot.organization_id == organization_id),
        )
        if deleted is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy chatbot")
        remaining = int(deleted.get("credit_balance", 0))
        if remaining:
            await db.execute(
                update(OrganizationCredit)
                .where(OrganizationCredit.organization_id == organization_id)
                .values(
                    **{"purchased_remaining": OrganizationCredit.purchased_remaining + remaining}
                )
            )
        await db.execute(
            delete(ChatbotDocument).where(ChatbotDocument.chatbot_id == chatbot_id_value)
        )


@router.put("/{chatbot_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_document(
    chatbot_id: UUID,
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    chatbot = await owned_chatbot(db, chatbot_id, context.organization.id)
    document = await db.scalar(
        select(Document)
        .where(
            and_(
                Document.id == str(document_id),
                Document.organization_id == str(context.organization.id),
                Document.status == DocumentStatus.DONE.value,
                Document.approval_status == "APPROVED",
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Tài liệu chưa sẵn sàng hoặc không tồn tại")
    relation = make_record(
        organization_id=str(context.organization.id),
        chatbot_id=str(chatbot.id),
        document_id=document["id"],
    )
    try:
        relation = await add_record(db, ChatbotDocument, relation)
    except IntegrityError:
        return None
