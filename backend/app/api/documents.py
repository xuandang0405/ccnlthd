from pathlib import Path
from uuid import UUID, uuid4

from anyio import to_thread
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import get_settings
from app.core.database import get_db
from app.models.entities import Document, DocumentStatus
from app.schemas.document import DocumentPreview, DocumentResponse
from app.services.documents import (
    UnsafeDocumentError,
    safe_remove,
    save_limited,
    validate_structure,
)

router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()


async def owned_document(db: AsyncSession, document_id: UUID, organization_id: UUID) -> Document:
    document = await db.scalar(
        select(Document).where(
            Document.id == document_id, Document.organization_id == organization_id
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    return document


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    context: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)
):
    values = await db.scalars(
        select(Document)
        .where(Document.organization_id == context.organization.id)
        .order_by(Document.created_at.desc())
    )
    return list(values)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(),
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
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
    document = Document(
        organization_id=context.organization.id,
        original_name=original_name,
        storage_key=storage_key,
        mime_type=mime_type,
        size_bytes=size,
        status=DocumentStatus.UPLOADED,
    )
    db.add(document)
    await db.flush()
    return document


@router.get("/{document_id}/preview", response_model=DocumentPreview)
async def preview_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    document = await owned_document(db, document_id, context.organization.id)
    return DocumentPreview(
        id=document.id,
        original_name=document.original_name,
        status=document.status,
        content=document.extracted_text[:20_000] if document.extracted_text else None,
    )


@router.post("/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    document = await owned_document(db, document_id, context.organization.id)
    if document.status not in {DocumentStatus.FAILED, DocumentStatus.PROCESSING}:
        raise HTTPException(status_code=409, detail="Tài liệu không ở trạng thái có thể thử lại")
    document.status = DocumentStatus.UPLOADED
    document.processing_error = None
    await db.flush()
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    document = await owned_document(db, document_id, context.organization.id)
    await db.delete(document)
    await db.flush()
    await to_thread.run_sync(safe_remove, settings.upload_dir / document.storage_key)
