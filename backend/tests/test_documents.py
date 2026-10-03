from io import BytesIO

import pytest
from httpx import AsyncClient
from openpyxl import Workbook

from app.core.mongodb import get_mongo_database, new_document, record
from app.integrations.gemini import GeminiServiceError
from app.services.document_links import revoke_auto_approvals
from app.services.document_review import DocumentReview, review_catalog_with_ai
from app.services.documents import chunks, parse_xlsx
from app.workers.documents import process
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
    with pytest.raises(GeminiServiceError):
        await review_catalog_with_ai("Sản phẩm A, giá 500000 VND")


async def test_revoking_auto_approval_preserves_manual_approval():
    db = get_mongo_database()
    auto = new_document(
        organization_id="org", storage_key="auto.xlsx", approval_status="APPROVED"
    )
    manual = new_document(
        organization_id="org", storage_key="manual.xlsx", approval_status="APPROVED",
        approved_by_user_id="admin",
    )
    await db.documents.insert_many([auto, manual])
    await db.chatbot_documents.insert_many([
        new_document(document_id=auto["_id"], chatbot_id="auto-bot"),
        new_document(document_id=manual["_id"], chatbot_id="manual-bot"),
    ])
    assert await revoke_auto_approvals(db) == 1
    assert (await db.documents.find_one({"_id": auto["_id"]}))["approval_status"] == "PENDING"
    assert (await db.documents.find_one({"_id": manual["_id"]}))["approval_status"] == "APPROVED"
    assert await db.chatbot_documents.count_documents({"document_id": auto["_id"]}) == 0
    assert await db.chatbot_documents.count_documents({"document_id": manual["_id"]}) == 1


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
    chatbot = await client.post(
        "/api/v1/chatbots", headers=headers, json={"name": "Tư vấn viên"}
    )
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

    db = get_mongo_database()
    relation = await db.chatbot_documents.find_one(
        {"chatbot_id": chatbot_id, "document_id": document_id}
    )
    assert relation is None
    premature_link = await client.put(
        f"/api/v1/chatbots/{chatbot_id}/documents/{document_id}", headers=headers
    )
    assert premature_link.status_code == 404

    deleted = await client.delete(f"/api/v1/documents/{document_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    assert await db.documents.find_one({"_id": document_id}) is None
    assert await db.chatbot_documents.find_one({"document_id": document_id}) is None

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
    db = get_mongo_database()
    calls = []

    async def ai_review(text):
        calls.append(text)
        return DocumentReview(True, 95, 1, 2, "AI đã xác nhận bảng giá", [])

    monkeypatch.setattr("app.workers.documents.review_catalog_with_ai", ai_review)
    for auto_review in (False, True):
        await db.system_settings.update_one(
            {"_id": "document_moderation"},
            {"$set": {"auto_review": auto_review}},
            upsert=True,
        )
        uploaded = await client.post(
            "/api/v1/documents", headers=headers,
            files={"file": (
                "bang-gia.xlsx", xlsx_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )},
        )
        assert uploaded.status_code == 202, uploaded.text
        document_id = uploaded.json()["id"]
        await process(db, record(await db.documents.find_one({"_id": document_id})))
        updated = await client.get("/api/v1/documents", headers=headers)
        document = next(item for item in updated.json() if item["id"] == document_id)
        assert document["status"] == "DONE"
        assert document["approval_status"] == ("APPROVED" if auto_review else "PENDING")
        linked = await db.chatbot_documents.count_documents({"document_id": document_id})
        assert linked == int(auto_review)
        removed = await client.delete(f"/api/v1/documents/{document_id}", headers=headers)
        assert removed.status_code == 204
    assert len(calls) == 1
