from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from anyio import to_thread
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import TenantContext, get_tenant_context
from app.core.config import get_settings
from app.core.mongodb import MongoRecord, get_mongo_db, new_document, record
from app.models.entities import DocumentStatus
from app.schemas.document import DocumentPreview, DocumentResponse
from app.services.document_links import link_document_to_chatbots
from app.services.documents import (
    UnsafeDocumentError,
    safe_remove,
    save_limited,
    validate_structure,
)

router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()


async def owned_document(db: Any, document_id: UUID, organization_id: str) -> MongoRecord:
    document = await db.documents.find_one(
        {"_id": str(document_id), "organization_id": str(organization_id)}
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    return record(document)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    context: TenantContext = Depends(get_tenant_context), db: Any = Depends(get_mongo_db)
):
    documents = (
        await db.documents.find({"organization_id": str(context.organization.id)})
        .sort("created_at", -1)
        .to_list(None)
    )
    return [record(document) for document in documents]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(),
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
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
    document = new_document(
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
    await db.documents.insert_one(document)
    await link_document_to_chatbots(
        db,
        organization_id=str(context.organization.id),
        document_id=document["_id"],
    )
    return record(document)


@router.get("/{document_id}/preview", response_model=DocumentPreview)
async def preview_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
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
    db: Any = Depends(get_mongo_db),
):
    document = await owned_document(db, document_id, context.organization.id)
    if document.status not in {DocumentStatus.FAILED.value, DocumentStatus.PROCESSING.value}:
        raise HTTPException(status_code=409, detail="Tài liệu không ở trạng thái có thể thử lại")
    await db.documents.update_one(
        {"_id": str(document.id)},
        {
            "$set": {
                "status": DocumentStatus.UPLOADED.value,
                "processing_error": None,
                "updated_at": datetime.now(UTC),
            }
        },
    )
    return record(await db.documents.find_one({"_id": str(document.id)}))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Any = Depends(get_mongo_db),
):
    document = await owned_document(db, document_id, context.organization.id)
    await db.documents.delete_one({"_id": str(document.id)})
    await db.document_chunks.delete_many({"document_id": str(document.id)})
    await db.chatbot_documents.delete_many({"document_id": str(document.id)})
    await to_thread.run_sync(safe_remove, settings.upload_dir / document.storage_key)
