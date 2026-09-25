from app.core.mongodb import get_mongo_database, new_document
from tests.test_auth_and_tenants import register


async def test_super_admin_access_is_server_enforced(client):
    tokens, me = await register(client, "admin@example.com", "Admin Company")
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    forbidden = await client.get("/api/v1/admin/summary", headers=auth)
    assert forbidden.status_code == 403

    db = get_mongo_database()
    result = await db.users.update_one(
        {"email": "admin@example.com"}, {"$set": {"is_super_admin": True}}
    )
    assert result.matched_count == 1

    summary = await client.get("/api/v1/admin/summary", headers=auth)
    assert summary.status_code == 200
    assert summary.json()["organizations"] == 1
    organizations = await client.get("/api/v1/admin/organizations", headers=auth)
    assert organizations.status_code == 200
    assert organizations.json()[0]["id"] == me["organizations"][0]["id"]

    await db.users.update_one(
        {"email": "admin@example.com"}, {"$set": {"is_super_admin": False}}
    )
    demoted = await client.get("/api/v1/admin/summary", headers=auth)
    assert demoted.status_code == 403


async def test_admin_manages_chatbots_documents_moderation_and_tickets(client):
    admin_tokens, _ = await register(client, "portal-admin@example.com", "Portal Admin")
    customer_tokens, customer_me = await register(
        client, "portal-customer@example.com", "Portal Customer"
    )
    db = get_mongo_database()
    await db.users.update_one(
        {"email": "portal-admin@example.com"}, {"$set": {"is_super_admin": True}}
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

    document = new_document(
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
    await db.documents.insert_one(document)
    ai_review = await client.post(
        f"/api/v1/admin/documents/{document['_id']}/ai-review", headers=admin_headers
    )
    assert ai_review.status_code == 200, ai_review.text
    assert ai_review.json()["ai_review"]["score"] >= 70
    assert ai_review.json()["approval_status"] == "APPROVED"

    moderation = await client.put(
        "/api/v1/admin/settings/moderation",
        headers=admin_headers,
        json={"auto_review": False},
    )
    assert moderation.status_code == 200
    assert moderation.json()["auto_review"] is False

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
