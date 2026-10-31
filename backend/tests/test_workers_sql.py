from datetime import UTC, datetime, timedelta

from openpyxl import Workbook
from sqlalchemy import func, select

from app.core.records import add_record, make_record
from app.models.entities import ChatbotDocument, Document, DocumentChunk, DocumentChunkToken
from app.workers.documents import claim_document, process
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register


async def test_document_job_is_claimed_once_and_recovered_after_restart(client):
    _tokens, me = await register(client, "worker@example.com", "Test worker")
    db = get_test_database()
    document = await add_record(
        db,
        Document,
        make_record(
            organization_id=me["organizations"][0]["id"],
            original_name="prices.txt",
            storage_key="test-prices",
            mime_type="text/plain",
            size_bytes=10,
        ),
    )
    document_id = document.id
    await db.commit()
    claimed = await claim_document(db)
    assert claimed.id == document_id
    await db.commit()
    assert await claim_document(db) is None
    document.updated_at = datetime.now(UTC) - timedelta(minutes=16)
    await db.commit()
    recovered = await claim_document(db)
    assert recovered.id == document_id
    assert recovered.status == "PROCESSING"


async def worker_document(client, name):
    tokens, me = await register(client, "worker-retry@example.com", "Worker retry")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    db = get_test_database()
    document = await add_record(
        db,
        Document,
        make_record(
            organization_id=me["organizations"][0]["id"],
            original_name=name,
            storage_key=name,
            mime_type="application/octet-stream",
            size_bytes=100,
        ),
    )
    await db.commit()
    return db, document, headers


async def test_worker_failure_retry_and_duplicate_run_keep_one_index(client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.workers.documents.settings.upload_dir", tmp_path)
    db, document, headers = await worker_document(client, "retry.xlsx")
    document_id = document.id
    claimed = await claim_document(db)
    await db.commit()
    await process(db, claimed)  # File tạm mất: mô phỏng lỗi giữa claim và đọc dữ liệu.
    await db.commit()
    failed = await db.get(Document, document_id, populate_existing=True)
    assert failed.status == "FAILED"
    assert "FileNotFoundError" in failed.processing_error
    assert await db.scalar(select(func.count()).select_from(DocumentChunk)) == 0

    workbook = Workbook()
    workbook.active.append(["Tên sản phẩm", "Giá (VNĐ)", "Bảo hành"])
    workbook.active.append(["Máy kiểm thử", 18_990_000, "12 tháng"])
    workbook.save(tmp_path / "retry.xlsx")
    workbook.close()
    response = await client.post(f"/api/v1/documents/{document_id}/retry", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "UPLOADED"
    claimed = await claim_document(db)
    await db.commit()
    await process(db, claimed)
    await db.commit()
    finished = await db.get(Document, document_id, populate_existing=True)
    assert (finished.status, finished.approval_status, finished.processing_error) == (
        "DONE",
        "PENDING",
        None,
    )
    counts = [
        await db.scalar(select(func.count()).select_from(model))
        for model in (DocumentChunk, DocumentChunkToken)
    ]
    assert all(count > 0 for count in counts)
    assert await db.scalar(select(func.count()).select_from(ChatbotDocument)) == 0
    assert await claim_document(db) is None
    # Gọi xử lý lại cùng nội dung không nhân đôi các chunk hoặc token.
    await process(db, finished)
    await db.commit()
    assert counts == [
        await db.scalar(select(func.count()).select_from(model))
        for model in (DocumentChunk, DocumentChunkToken)
    ]


async def test_retry_cannot_requeue_a_worker_that_is_still_processing(client):
    db, document, headers = await worker_document(client, "busy.xlsx")
    document_id = document.id
    await claim_document(db)
    await db.commit()
    response = await client.post(f"/api/v1/documents/{document_id}/retry", headers=headers)
    assert response.status_code == 409
    assert (await db.get(Document, document_id, populate_existing=True)).status == "PROCESSING"
