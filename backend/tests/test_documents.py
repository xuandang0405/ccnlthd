from io import BytesIO

from httpx import AsyncClient
from openpyxl import Workbook

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
