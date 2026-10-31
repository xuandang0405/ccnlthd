from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from anyio import to_thread
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import and_, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.core.records import add_record, make_record
from app.models.entities import ChatbotDocument, Document, DocumentChunk, DocumentStatus
from app.schemas.document import DocumentPreview, DocumentResponse
from app.services.documents import (
    UnsafeDocumentError,
    safe_remove,
    save_limited,
    validate_structure,
)

router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()


async def owned_document(db: AsyncSession, document_id: UUID, organization_id: str) -> Base:
    document = await db.scalar(
        select(Document)
        .where(
            and_(Document.id == str(document_id), Document.organization_id == str(organization_id))
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    return document


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    documents = (
        await db.scalars(
            select(Document)
            .where(Document.organization_id == str(context.organization.id))
            .order_by(Document.created_at.desc())
            .execution_options(populate_existing=True)
        )
    ).all()
    return [document for document in documents]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    storage_key = f"{context.organization.id}/{uuid4().hex}{extension}"
    destination = settings.upload_dir / storage_key
    try:
        size = await to_thread.run_sync(
            save_limited, file.file, destination, settings.max_upload_bytes
        )
        mime_type = await to_thread.run_sync(validate_structure, destination, extension)
    except UnsafeDocumentError as exc:
        await to_thread.run_sync(safe_remove, destination)
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    finally:
        await file.close()
    document = make_record(
        organization_id=str(context.organization.id),
        original_name=original_name,
        storage_key=storage_key,
        mime_type=mime_type,
        size_bytes=size,
        status=DocumentStatus.UPLOADED.value,
        extracted_text=None,
        processing_error=None,
        approval_status="PENDING",
        approval_note=None,
        ai_review=None,
    )
    document = await add_record(db, Document, document)
    return document


@router.get("/{document_id}/preview", response_model=DocumentPreview)
async def preview_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    document = await owned_document(db, document_id, context.organization.id)
    content = document.extracted_text[:20_000] if document.extracted_text else None
    return DocumentPreview(
        id=document.id,
        original_name=document.original_name,
        status=document.status,
        content=content,
    )


@router.post("/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    document = await owned_document(db, document_id, context.organization.id)
    await db.refresh(document, with_for_update=True)
    if document.status not in {DocumentStatus.FAILED.value, DocumentStatus.PROCESSING.value}:
        raise HTTPException(status_code=409, detail="Tài liệu không ở trạng thái có thể thử lại")
    if (
        document.status == DocumentStatus.PROCESSING.value
        and document.updated_at > datetime.now(UTC) - timedelta(minutes=15)
    ):
        raise HTTPException(status_code=409, detail="Tài liệu đang xử lý, vui lòng chờ hoàn tất")
    await db.execute(
        update(Document)
        .where(Document.id == str(document.id))
        .values(
            **{
                **{
                    "status": DocumentStatus.UPLOADED.value,
                    "processing_error": None,
                    "updated_at": datetime.now(UTC),
                }
            }
        )
    )
    return await db.scalar(
        select(Document)
        .where(Document.id == str(document.id))
        .limit(1)
        .execution_options(populate_existing=True)
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    document = await owned_document(db, document_id, context.organization.id)
    await db.execute(delete(Document).where(Document.id == str(document.id)))
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == str(document.id)))
    await db.execute(delete(ChatbotDocument).where(ChatbotDocument.document_id == str(document.id)))
    await to_thread.run_sync(safe_remove, settings.upload_dir / document.storage_key)
