from io import BytesIO

import pytest
from httpx import AsyncClient
from openpyxl import Workbook
from sqlalchemy import and_, func, select

from app.core.records import add_record, add_records, make_record, update_record
from app.core.security import hash_password
from app.integrations.gemini import GeminiServiceError
from app.models.entities import (
    Chatbot,
    ChatbotDocument,
    Document,
    Organization,
    SystemSetting,
    User,
)
from app.services.document_links import revoke_auto_approvals
from app.services.document_review import DocumentReview, review_catalog_with_ai
from app.services.documents import chunks, parse_xlsx
from app.workers.documents import process
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register


def xlsx_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Bảng giá"
    sheet.append(["Sản phẩm", "Giá"])
    sheet.append(["Sản phẩm A", 500_000])
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def test_xlsx_rows_keep_headers_and_chunk_boundaries(tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sản phẩm"
    sheet.append(["BẢNG GIÁ LINH KIỆN"])
    sheet.append([])
    sheet.append(["Danh mục", "Tên sản phẩm", "Giá (VNĐ)", "Tình trạng"])
    for index in range(80):
        sheet.append(["Card đồ họa", f"RTX 4060 mẫu {index}", 9_990_000 + index, "Còn hàng"])
    path = tmp_path / "large-catalog.xlsx"
    workbook.save(path)
    workbook.close()

    text = parse_xlsx(path, max_cells=10_000)
    assert "Tên sản phẩm: RTX 4060 mẫu 0" in text
    assert "Giá (VNĐ): 9990000" in text
    pieces = chunks(text, target_size=800, overlap=100)
    assert len(pieces) > 2
    assert all(not piece.startswith("ản phẩm") for piece in pieces)


async def test_ai_review_parses_structured_result(monkeypatch):
    async def fake_review(_self, _text):
        return '{"passed":true,"score":92,"summary":"Có sản phẩm và giá","issues":[]}'

    monkeypatch.setattr("app.integrations.gemini.GeminiService.review_document", fake_review)
    result = await review_catalog_with_ai("Sản phẩm A, giá 500000 VND")
    assert result.passed is True
    assert result.score == 92

    async def invalid_review(_self, _text):
        return '{"passed":true,"score":20,"summary":"Không đủ tin cậy","issues":[]}'

    monkeypatch.setattr("app.integrations.gemini.GeminiService.review_document", invalid_review)
    low_score = await review_catalog_with_ai("Sản phẩm A, giá 500000 VND")
    assert low_score.passed is False

    async def malformed_review(_self, _text):
        return "not-json"

    monkeypatch.setattr("app.integrations.gemini.GeminiService.review_document", malformed_review)
    with pytest.raises(GeminiServiceError) as failure:
        await review_catalog_with_ai("Sản phẩm A, giá 500000 VND")
    assert "gemini" not in str(failure.value).casefold()


async def test_revoking_auto_approval_preserves_manual_approval():
    db = get_test_database()
    await add_record(db, Organization, make_record(id="org", name="Test", slug="test"))
    await add_record(
        db,
        User,
        make_record(
            id="admin",
            email="review@example.com",
            full_name="Admin",
            password_hash=hash_password("StrongPassword123"),
        ),
    )
    for bot_id in ("auto-bot", "manual-bot"):
        await add_record(db, Chatbot, make_record(id=bot_id, organization_id="org", name=bot_id))
    auto = make_record(
        organization_id="org",
        storage_key="auto.xlsx",
        approval_status="APPROVED",
        original_name="auto.xlsx",
        mime_type="application/xlsx",
        size_bytes=100,
    )
    manual = make_record(
        organization_id="org",
        storage_key="manual.xlsx",
        approval_status="APPROVED",
        approved_by_user_id="admin",
        original_name="manual.xlsx",
        mime_type="application/xlsx",
        size_bytes=100,
    )
    await add_records(db, Document, [auto, manual])
    await add_records(
        db,
        ChatbotDocument,
        [
            make_record(organization_id="org", document_id=auto["id"], chatbot_id="auto-bot"),
            make_record(organization_id="org", document_id=manual["id"], chatbot_id="manual-bot"),
        ],
    )
    assert await revoke_auto_approvals(db) == 1
    assert (
        await db.scalar(
            select(Document)
            .where(Document.id == auto["id"])
            .limit(1)
            .execution_options(populate_existing=True)
        )
    )["approval_status"] == "PENDING"
    assert (
        await db.scalar(
            select(Document)
            .where(Document.id == manual["id"])
            .limit(1)
            .execution_options(populate_existing=True)
        )
    )["approval_status"] == "APPROVED"
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == auto["id"])
        )
        == 0
    )
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == manual["id"])
        )
        == 1
    )


async def test_xlsx_upload_and_tenant_access(client: AsyncClient):
    alpha_tokens, alpha_me = await register(client, "docs-alpha@example.com", "Alpha Docs")
    beta_tokens, beta_me = await register(client, "docs-beta@example.com", "Beta Docs")
    alpha_org = alpha_me["organizations"][0]["id"]
    alpha_headers = {
        "Authorization": f"Bearer {alpha_tokens['access_token']}",
        "X-Organization-ID": alpha_org,
    }
    uploaded = await client.post(
        "/api/v1/documents",
        headers=alpha_headers,
        files={
            "file": (
                "bang-gia.xlsx",
                xlsx_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert uploaded.status_code == 202, uploaded.text
    assert uploaded.json()["status"] == "UPLOADED"

    beta_headers = {
        "Authorization": f"Bearer {beta_tokens['access_token']}",
        "X-Organization-ID": beta_me["organizations"][0]["id"],
    }
    preview = await client.get(
        f"/api/v1/documents/{uploaded.json()['id']}/preview", headers=beta_headers
    )
    assert preview.status_code == 404


async def test_rejects_fake_pdf(client: AsyncClient):
    tokens, me = await register(client, "unsafe@example.com", "Unsafe Test")
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": me["organizations"][0]["id"],
    }
    response = await client.post(
        "/api/v1/documents",
        headers=headers,
        files={"file": ("malware.pdf", b"<?php echo 'bad'; ?>", "application/pdf")},
    )
    assert response.status_code == 415


async def test_upload_links_to_chatbot_and_delete_removes_document(client: AsyncClient):
    tokens, me = await register(client, "linked-docs@example.com", "Linked Docs")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    chatbot = await client.post("/api/v1/chatbots", headers=headers, json={"name": "Tư vấn viên"})
    assert chatbot.status_code == 201, chatbot.text

    uploaded = await client.post(
        "/api/v1/documents",
        headers=headers,
        files={
            "file": (
                "bang-gia.xlsx",
                xlsx_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert uploaded.status_code == 202, uploaded.text
    document_id = uploaded.json()["id"]
    chatbot_id = chatbot.json()["id"]

    db = get_test_database()
    relation = await db.scalar(
        select(ChatbotDocument)
        .where(
            and_(
                ChatbotDocument.chatbot_id == chatbot_id, ChatbotDocument.document_id == document_id
            )
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )
    assert relation is None
    premature_link = await client.put(
        f"/api/v1/chatbots/{chatbot_id}/documents/{document_id}", headers=headers
    )
    assert premature_link.status_code == 404

    deleted = await client.delete(f"/api/v1/documents/{document_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    assert (
        await db.scalar(
            select(Document)
            .where(Document.id == document_id)
            .limit(1)
            .execution_options(populate_existing=True)
        )
        is None
    )
    assert (
        await db.scalar(
            select(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
            .limit(1)
            .execution_options(populate_existing=True)
        )
        is None
    )

    listed = await client.get("/api/v1/documents", headers=headers)
    assert listed.status_code == 200
    assert all(item["id"] != document_id for item in listed.json())


async def test_worker_only_links_documents_after_ai_approval(client: AsyncClient, monkeypatch):
    tokens, me = await register(client, "review-docs@example.com", "Review Docs")
    organization_id = me["organizations"][0]["id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }
    chatbot = await client.post("/api/v1/chatbots", headers=headers, json={"name": "Bot review"})
    assert chatbot.status_code == 201
    db = get_test_database()
    calls = []

    async def ai_review(text):
        calls.append(text)
        return DocumentReview(True, 95, 1, 2, "AI đã xác nhận bảng giá", [])

    monkeypatch.setattr("app.workers.documents.review_catalog_with_ai", ai_review)
    for auto_review in (False, True):
        await update_record(
            db,
            SystemSetting,
            (SystemSetting.id == "document_moderation"),
            values={"auto_review": auto_review},
            defaults=make_record(**{"id": "document_moderation"}),
        )
        uploaded = await client.post(
            "/api/v1/documents",
            headers=headers,
            files={
                "file": (
                    "bang-gia.xlsx",
                    xlsx_bytes(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert uploaded.status_code == 202, uploaded.text
        document_id = uploaded.json()["id"]
        await process(
            db,
            await db.scalar(
                select(Document)
                .where(Document.id == document_id)
                .limit(1)
                .execution_options(populate_existing=True)
            ),
        )
        updated = await client.get("/api/v1/documents", headers=headers)
        document = next(item for item in updated.json() if item["id"] == document_id)
        assert document["status"] == "DONE"
        assert document["approval_status"] == ("APPROVED" if auto_review else "PENDING")
        linked = await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
        )
        assert linked == int(auto_review)
        removed = await client.delete(f"/api/v1/documents/{document_id}", headers=headers)
        assert removed.status_code == 204
    assert len(calls) == 1
