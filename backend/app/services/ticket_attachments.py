from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from anyio import to_thread
from fastapi import HTTPException, UploadFile

from app.core.config import get_settings
from app.services.documents import UnsafeDocumentError, safe_remove, save_limited

ALLOWED_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
}


def _validate_signature(path: Path, extension: str) -> None:
    with path.open("rb") as stream:
        head = stream.read(16)
    valid = {
        ".png": head.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": head.startswith(b"\xff\xd8\xff"),
        ".jpeg": head.startswith(b"\xff\xd8\xff"),
        ".gif": head.startswith((b"GIF87a", b"GIF89a")),
        ".webp": head.startswith(b"RIFF") and head[8:12] == b"WEBP",
        ".pdf": head.startswith(b"%PDF-"),
        ".doc": head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".xls": head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".docx": head.startswith(b"PK"),
        ".xlsx": head.startswith(b"PK"),
        ".zip": head.startswith(b"PK"),
    }
    if extension in valid and not valid[extension]:
        raise UnsafeDocumentError("Nội dung tệp không khớp với phần mở rộng")
    if extension in {".txt", ".csv"} and b"\x00" in head:
        raise UnsafeDocumentError("Tệp văn bản không hợp lệ")


async def save_ticket_files(
    files: list[UploadFile], organization_id: str, ticket_id: str
) -> list[dict]:
    settings = get_settings()
    if not files or len(files) > 5:
        raise HTTPException(status_code=400, detail="Mỗi tin nhắn hỗ trợ tối đa 5 tệp")
    attachments: list[dict] = []
    for file in files:
        original_name = Path(file.filename or "").name[:255]
        extension = Path(original_name).suffix.lower()
        if not original_name or extension not in ALLOWED_TYPES:
            await file.close()
            raise HTTPException(
                status_code=415,
                detail="Chỉ hỗ trợ ảnh, PDF, TXT, CSV, Word, Excel và ZIP",
            )
        attachment_id = str(uuid4())
        storage_key = f"tickets/{organization_id}/{ticket_id}/{attachment_id}{extension}"
        destination = settings.upload_dir / storage_key
        try:
            size = await to_thread.run_sync(
                save_limited, file.file, destination, settings.max_upload_bytes
            )
            await to_thread.run_sync(_validate_signature, destination, extension)
        except UnsafeDocumentError as exc:
            await to_thread.run_sync(safe_remove, destination)
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        finally:
            await file.close()
        attachments.append(
            {
                "id": attachment_id,
                "original_name": original_name,
                "storage_key": storage_key,
                "mime_type": ALLOWED_TYPES[extension],
                "size_bytes": size,
                "created_at": datetime.now(UTC),
            }
        )
    return attachments


def attachment_path(storage_key: str) -> Path:
    root = get_settings().upload_dir.resolve()
    path = (root / storage_key).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp đính kèm")
    return path


def find_attachment(ticket: dict, attachment_id: str) -> dict:
    for message in ticket.get("messages", []):
        for attachment in message.get("attachments", []):
            if attachment.get("id") == attachment_id:
                return attachment
    raise HTTPException(status_code=404, detail="Không tìm thấy tệp đính kèm")
