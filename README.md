# AI Sales Assistant SaaS

Nền tảng trợ lý bán hàng đa doanh nghiệp bằng FastAPI, React, PostgreSQL, Redis và Google Gemini. Source hiện có luồng đăng ký/đăng nhập, cách ly tenant, chatbot, kho tài liệu PDF/DOCX/XLSX, worker bền qua restart, widget khách truy cập, hội thoại, lead, quota, đơn thanh toán SePay, kích hoạt subscription và trang super admin.

## Khởi động nhanh

Yêu cầu cho production-like: Docker Desktop/Engine có Compose, domain trỏ đúng máy và cổng 80/443 đi được từ Internet.

```powershell
Copy-Item .env.example .env
# Điền secret, mật khẩu PostgreSQL, domain và các tích hợp thật.
docker compose up -d --build
docker compose ps
```

Backend tự chạy `alembic upgrade head`. Truy cập `https://APP_DOMAIN/`; health tại `/health/live` và `/health/ready`.

Development không Docker được mô tả tại [docs/INSTALLATION.md](docs/INSTALLATION.md). API, database, bảo mật và vận hành nằm trong thư mục `docs/`.

## Những gì chưa được xác minh trên máy này

- Gemini thật: thiếu `GEMINI_API_KEY` và `GEMINI_MODEL` được tài khoản cho phép.
- Telegram thật: có luồng challenge xác minh destination và worker retry hữu hạn, nhưng chưa có Bot Token/destination thật để kiểm chứng gửi.
- SePay thật/VietQR: chưa có API key, thông tin ngân hàng và số tiền Pro thật; chỉ luồng webhook API Key được kiểm thử tự động.
- Docker Compose, PostgreSQL, Redis, HTTPS, restart, backup/restore: Docker chưa có trên máy khi kiểm tra.
- Truy cập Internet: chưa có domain, xác nhận IP public/CGNAT, DNS hoặc port forwarding.

Không coi bản này đủ điều kiện production trước khi hoàn tất checklist trong [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Kiểm thử local

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -e ".[dev]"
.\.venv\Scripts\ruff.exe check app tests
.\.venv\Scripts\pytest.exe --cov=app

cd ..\frontend
npm ci
npm run lint
npm run build
npm audit --omit=dev
```

Không commit `.env`, API key, token, thông tin ngân hàng hoặc dữ liệu khách hàng. Chỉ push sau khi chủ dự án xác nhận.
