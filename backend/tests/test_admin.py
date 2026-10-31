from sqlalchemy import func, select, update

from app.core.records import add_record, make_record
from app.integrations.gemini import GeminiServiceError
from app.models.entities import AuditLog, ChatbotDocument, Document, User
from app.services.document_review import DocumentReview
from tests.conftest import get_test_database
from tests.test_auth_and_tenants import register


async def test_super_admin_access_is_server_enforced(client):
    tokens, me = await register(client, "admin@example.com", "Admin Company")
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    forbidden = await client.get("/api/v1/admin/summary", headers=auth)
    assert forbidden.status_code == 403

    db = get_test_database()
    result = await db.execute(
        update(User).where(User.email == "admin@example.com").values(**{**{"is_super_admin": True}})
    )
    assert result.rowcount == 1

    summary = await client.get("/api/v1/admin/summary", headers=auth)
    assert summary.status_code == 200
    assert summary.json()["organizations"] == 1
    organizations = await client.get("/api/v1/admin/organizations", headers=auth)
    assert organizations.status_code == 200
    assert organizations.json()[0]["id"] == me["organizations"][0]["id"]

    await db.execute(
        update(User)
        .where(User.email == "admin@example.com")
        .values(**{**{"is_super_admin": False}})
    )
    demoted = await client.get("/api/v1/admin/summary", headers=auth)
    assert demoted.status_code == 403


async def test_admin_manages_chatbots_documents_moderation_and_tickets(client, monkeypatch):
    admin_tokens, _ = await register(client, "portal-admin@example.com", "Portal Admin")
    customer_tokens, customer_me = await register(
        client, "portal-customer@example.com", "Portal Customer"
    )
    db = get_test_database()
    await db.execute(
        update(User)
        .where(User.email == "portal-admin@example.com")
        .values(**{**{"is_super_admin": True}})
    )
    admin_headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    organization_id = customer_me["organizations"][0]["id"]
    customer_headers = {
        "Authorization": f"Bearer {customer_tokens['access_token']}",
        "X-Organization-ID": organization_id,
    }

    chatbot = await client.post(
        "/api/v1/chatbots", headers=customer_headers, json={"name": "Bot khách hàng"}
    )
    assert chatbot.status_code == 201, chatbot.text
    admin_chatbots = await client.get("/api/v1/admin/chatbots", headers=admin_headers)
    assert admin_chatbots.status_code == 200
    assert admin_chatbots.json()[0]["organization_name"] == "Portal Customer"

    document = make_record(
        organization_id=organization_id,
        original_name="bang-gia.xlsx",
        storage_key="test/bang-gia.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=100,
        status="DONE",
        extracted_text="Sản phẩm | Giá bán\nLaptop ABC | 15.999.000 VND",
        processing_error=None,
        approval_status="PENDING",
        approval_note=None,
        ai_review=None,
    )
    document = await add_record(db, Document, document)
    document_id = document.id
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
        )
        == 0
    )
    disabled_review = await client.post(
        f"/api/v1/admin/documents/{document_id}/ai-review", headers=admin_headers
    )
    assert disabled_review.status_code == 409
    enabled = await client.put(
        "/api/v1/admin/settings/moderation",
        headers=admin_headers,
        json={"auto_review": True},
    )
    assert enabled.status_code == 200

    async def unavailable_ai(_text):
        raise GeminiServiceError("Gemini tạm thời không phản hồi")

    monkeypatch.setattr("app.api.admin.review_catalog_with_ai", unavailable_ai)
    failed_review = await client.post(
        f"/api/v1/admin/documents/{document_id}/ai-review", headers=admin_headers
    )
    assert failed_review.status_code == 503
    assert "gemini" not in failed_review.text.casefold()
    assert "Vui lòng thử lại sau" in failed_review.json()["detail"]
    assert (
        await db.scalar(
            select(Document)
            .where(Document.id == document_id)
            .limit(1)
            .execution_options(populate_existing=True)
        )
    )["approval_status"] == "PENDING"

    async def approved_by_ai(_text):
        return DocumentReview(True, 90, 1, 2, "Có sản phẩm và giá", [])

    monkeypatch.setattr("app.api.admin.review_catalog_with_ai", approved_by_ai)
    ai_review = await client.post(
        f"/api/v1/admin/documents/{document_id}/ai-review", headers=admin_headers
    )
    assert ai_review.status_code == 200, ai_review.text
    assert ai_review.json()["ai_review"]["score"] >= 70
    assert ai_review.json()["approval_status"] == "APPROVED"
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
        )
        == 1
    )

    moderation = await client.put(
        "/api/v1/admin/settings/moderation",
        headers=admin_headers,
        json={"auto_review": False},
    )
    assert moderation.status_code == 200
    assert moderation.json()["auto_review"] is False
    user_document = await client.get("/api/v1/documents", headers=customer_headers)
    assert user_document.json()[0]["approval_status"] == "PENDING"
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
        )
        == 0
    )
    manual = await client.patch(
        f"/api/v1/admin/documents/{document_id}/approval",
        headers=admin_headers,
        json={"approval_status": "APPROVED"},
    )
    assert manual.status_code == 200, manual.text
    assert (
        await db.scalar(
            select(func.count())
            .select_from(ChatbotDocument)
            .where(ChatbotDocument.document_id == document_id)
        )
        == 1
    )

    ticket = await client.post(
        "/api/v1/tickets",
        headers=customer_headers,
        json={"subject": "Cần hỗ trợ chatbot", "message": "Chatbot chưa hiện trên website."},
    )
    assert ticket.status_code == 201, ticket.text
    ticket_id = ticket.json()["id"]
    listed = await client.get("/api/v1/admin/tickets", headers=admin_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["organization_name"] == "Portal Customer"
    assert listed.json()[0]["created_by_email"] == "portal-customer@example.com"
    assert listed.json()[0]["created_by_user_id"] == customer_me["id"]
    assert listed.json()[0]["admin_unread_count"] == 1
    marked_read = await client.patch(
        f"/api/v1/admin/tickets/{ticket_id}/read", headers=admin_headers
    )
    assert marked_read.status_code == 200
    assert marked_read.json()["admin_unread_count"] == 0
    attachment = await client.post(
        f"/api/v1/tickets/{ticket_id}/attachments",
        headers=customer_headers,
        data={"message": "Ảnh lỗi trên màn hình"},
        files={"files": ("loi.png", b"\x89PNG\r\n\x1a\nimage-data", "image/png")},
    )
    assert attachment.status_code == 200, attachment.text
    attachment_data = attachment.json()["messages"][-1]["attachments"][0]
    assert attachment_data["original_name"] == "loi.png"
    downloaded = await client.get(
        f"/api/v1/admin/tickets/{ticket_id}/attachments/{attachment_data['id']}",
        headers=admin_headers,
    )
    assert downloaded.status_code == 200
    assert downloaded.content.startswith(b"\x89PNG")
    replied = await client.post(
        f"/api/v1/admin/tickets/{ticket_id}/replies",
        headers=admin_headers,
        json={"message": "Admin đang kiểm tra cho bạn."},
    )
    assert replied.status_code == 200, replied.text
    assert replied.json()["status"] == "IN_PROGRESS"
    assert replied.json()["messages"][-1]["sender_type"] == "ADMIN"
    resolved = await client.patch(
        f"/api/v1/admin/tickets/{ticket_id}/status",
        headers=admin_headers,
        json={"status": "RESOLVED"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "RESOLVED"


async def test_admin_can_grant_and_reclaim_user_and_chatbot_credits(client):
    admin_tokens, _ = await register(client, "credits-admin@example.com", "Admin Company")
    customer_tokens, customer = await register(
        client, "credits-customer@example.com", "Customer Company"
    )
    db = get_test_database()
    await db.execute(
        update(User)
        .where(User.email == "credits-admin@example.com")
        .values(**{**{"is_super_admin": True}})
    )
    admin_headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    customer_headers = {
        "Authorization": f"Bearer {customer_tokens['access_token']}",
        "X-Organization-ID": customer["organizations"][0]["id"],
    }
    organization_id = customer["organizations"][0]["id"]
    user_id = customer["id"]
    bot = await client.post(
        "/api/v1/chatbots", headers=customer_headers, json={"name": "Bot khách hàng"}
    )
    assert bot.status_code == 201
    bot_id = bot.json()["id"]

    denied = await client.post(
        f"/api/v1/admin/users/{user_id}/credits",
        headers=customer_headers,
        json={"organization_id": organization_id, "amount": 75, "reason": "Hỗ trợ thử nghiệm"},
    )
    assert denied.status_code == 403
    assert (
        await client.get("/api/v1/admin/audit-logs", headers=customer_headers)
    ).status_code == 403
    granted = await client.post(
        f"/api/v1/admin/users/{user_id}/credits",
        headers=admin_headers,
        json={"organization_id": organization_id, "amount": 75, "reason": "Hỗ trợ thử nghiệm"},
    )
    assert granted.status_code == 200, granted.text
    assert granted.json()["purchased_remaining"] == 75
    users = await client.get("/api/v1/admin/users", headers=admin_headers)
    customer_row = next(item for item in users.json() if item["id"] == user_id)
    assert customer_row["organization_accounts"][0]["purchased_remaining"] == 75
    searched_users = await client.get(
        "/api/v1/admin/users?search=credits-customer", headers=admin_headers
    )
    assert [item["id"] for item in searched_users.json()] == [user_id]
    dashboard = await client.get("/api/v1/dashboard/summary", headers=customer_headers)
    assert dashboard.json()["purchased_credits_remaining"] == 75

    reclaimed = await client.post(
        f"/api/v1/admin/users/{user_id}/credits",
        headers=admin_headers,
        json={"organization_id": organization_id, "amount": -25, "reason": "Điều chỉnh"},
    )
    assert reclaimed.status_code == 200
    assert reclaimed.json()["purchased_remaining"] == 50
    too_many = await client.post(
        f"/api/v1/admin/users/{user_id}/credits",
        headers=admin_headers,
        json={"organization_id": organization_id, "amount": -51, "reason": "Điều chỉnh"},
    )
    assert too_many.status_code == 409
    slots = await client.post(
        f"/api/v1/admin/users/{user_id}/slots",
        headers=admin_headers,
        json={"organization_id": organization_id, "amount": 2, "reason": "Mở thêm chatbot"},
    )
    assert slots.status_code == 200, slots.text
    assert slots.json()["chatbot_slots"] == 3
    too_many_slots = await client.post(
        f"/api/v1/admin/users/{user_id}/slots",
        headers=admin_headers,
        json={"organization_id": organization_id, "amount": -3, "reason": "Thu hồi"},
    )
    assert too_many_slots.status_code == 409
    wrong_org = await client.post(
        f"/api/v1/admin/users/{user_id}/credits",
        headers=admin_headers,
        json={
            "organization_id": (await client.get("/api/v1/auth/me", headers=admin_headers)).json()[
                "organizations"
            ][0]["id"],
            "amount": 10,
            "reason": "Sai doanh nghiệp",
        },
    )
    assert wrong_org.status_code == 404

    bot_grant = await client.post(
        f"/api/v1/admin/chatbots/{bot_id}/credits",
        headers=admin_headers,
        json={"amount": 30, "reason": "Hỗ trợ chatbot"},
    )
    assert bot_grant.status_code == 200, bot_grant.text
    assert bot_grant.json()["credit_balance"] == 30
    assert bot_grant.json()["owner_emails"] == ["credits-customer@example.com"]
    searched_bots = await client.get(
        "/api/v1/admin/chatbots?search=Bot%20kh%C3%A1ch", headers=admin_headers
    )
    assert [item["id"] for item in searched_bots.json()] == [bot_id]
    denied_bot_grant = await client.post(
        f"/api/v1/admin/chatbots/{bot_id}/credits",
        headers=customer_headers,
        json={"amount": 30, "reason": "Không có quyền"},
    )
    assert denied_bot_grant.status_code == 403
    bot_reclaim = await client.post(
        f"/api/v1/admin/chatbots/{bot_id}/credits",
        headers=admin_headers,
        json={"amount": -10, "reason": "Điều chỉnh"},
    )
    assert bot_reclaim.json()["credit_balance"] == 20
    updated = await client.patch(
        f"/api/v1/admin/chatbots/{bot_id}",
        headers=admin_headers,
        json={"name": "Bot đã cập nhật", "greeting": "Xin chào khách hàng"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Bot đã cập nhật"
    assert updated.json()["greeting"] == "Xin chào khách hàng"
    customer_bot = await client.get(f"/api/v1/chatbots/{bot_id}", headers=customer_headers)
    assert customer_bot.json()["credit_balance"] == 20

    renamed = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=admin_headers,
        json={"full_name": "Khách hàng mới", "email": "credits-renamed@example.com"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["full_name"] == "Khách hàng mới"
    assert renamed.json()["email"] == "credits-renamed@example.com"
    reset = await client.post(
        f"/api/v1/admin/users/{user_id}/reset-password", headers=admin_headers
    )
    assert reset.status_code == 200, reset.text
    temporary_password = reset.json()["temporary_password"]
    assert len(temporary_password) >= 12
    assert (await client.get("/api/v1/auth/me", headers=customer_headers)).status_code == 401
    old_password = await client.post(
        "/api/v1/auth/login",
        json={"email": "credits-renamed@example.com", "password": "StrongPassword123"},
    )
    assert old_password.status_code == 401
    new_password = await client.post(
        "/api/v1/auth/login",
        json={"email": "credits-renamed@example.com", "password": temporary_password},
    )
    assert new_password.status_code == 200, new_password.text
    customer_headers["Authorization"] = f"Bearer {new_password.json()['access_token']}"
    promoted = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=admin_headers,
        json={"is_super_admin": True},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["is_super_admin"] is True
    assert (await client.get("/api/v1/admin/summary", headers=customer_headers)).status_code == 200
    demoted = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=admin_headers,
        json={"is_super_admin": False},
    )
    assert demoted.status_code == 200
    assert (await client.get("/api/v1/admin/summary", headers=customer_headers)).status_code == 403
    admin_id = (await client.get("/api/v1/auth/me", headers=admin_headers)).json()["id"]
    self_demote = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        headers=admin_headers,
        json={"is_super_admin": False},
    )
    assert self_demote.status_code == 409
    blocked = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert blocked.status_code == 200
    old_session = await client.get("/api/v1/auth/me", headers=customer_headers)
    assert old_session.status_code == 401
    audit = await db.scalar(
        select(func.count())
        .select_from(AuditLog)
        .where(
            AuditLog.actor_user_id
            == (await client.get("/api/v1/auth/me", headers=admin_headers)).json()["id"]
        )
    )
    assert audit >= 5
    audit_response = await client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    assert audit_response.status_code == 200
    assert any(event["action"] == "ADMIN_USER_CREDITS_ADJUSTED" for event in audit_response.json())
