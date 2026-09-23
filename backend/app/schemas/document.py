from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.entities import DocumentStatus


class DocumentResponse(BaseModel):
    id: UUID
    original_name: str
    mime_type: str
    size_bytes: int
    status: DocumentStatus
    processing_error: str | None
    approval_status: str = "PENDING"
    approval_note: str | None = None
    ai_review: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentPreview(BaseModel):
    id: UUID
    original_name: str
    status: DocumentStatus
    content: str | None
