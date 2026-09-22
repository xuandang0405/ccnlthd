# AI Sales Assistant SaaS

Nền tảng trợ lý bán hàng đa doanh nghiệp bằng FastAPI, React, PostgreSQL, Redis và Google Gemini. Source hiện có luồng đăng ký/đăng nhập, cách ly tenant, chatbot, kho tài liệu PDF/DOCX/XLSX, worker bền qua restart, widget khách truy cập, hội thoại, lead, quota, đơn thanh toán SePay, kích hoạt subscription và trang super admin.

Production Windows hiện tại: [https://seminar.bkpvp.top](https://seminar.bkpvp.top), đi qua Cloudflare Tunnel tới FastAPI chỉ bind trên localhost. Cấu hình một máy dùng SQLite WAL cho dữ liệu và quota bền; xem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Khởi động nhanh trên Windows

Nhấp đúp [run.bat](run.bat). Script tự chọn cách chạy:

- Có Docker đang hoạt động: chạy stack PostgreSQL + Redis + Caddy tại `http://localhost`.
- Không có Docker: chạy trực tiếp bằng Python + Node, SQLite và quota trong bộ nhớ tại `http://127.0.0.1:5173`.

Chế độ không Docker cần Python 3.12+ và Node.js 20+. Script tự tạo virtual environment, cài dependency khi thiếu, migration database, chạy hai worker và mở trình duyệt. Đây là chế độ development/demo; production vẫn cần PostgreSQL, Redis thật và HTTPS.

Để triển khai production-like bằng Docker:

```powershell
Copy-Item .env.example .env
# Điền secret, mật khẩu PostgreSQL, domain và các tích hợp thật.
docker compose up -d --build
docker compose ps
```

Backend tự chạy `alembic upgrade head`. Truy cập `https://APP_DOMAIN/`; health tại `/health/live` và `/health/ready`.

Chi tiết cài đặt không Docker nằm tại [docs/INSTALLATION.md](docs/INSTALLATION.md). Đối chiếu với báo cáo mới nằm tại [docs/REPORT_ALIGNMENT.md](docs/REPORT_ALIGNMENT.md).

## Những gì chưa được xác minh trên máy này

- Gemini thật: thiếu `GEMINI_API_KEY` và `GEMINI_MODEL` được tài khoản cho phép.
- Telegram thật: có luồng challenge xác minh destination và worker retry hữu hạn, nhưng chưa có Bot Token/destination thật để kiểm chứng gửi.
- SePay thật/VietQR: chưa có API key/HMAC secret, thông tin ngân hàng và số tiền Pro thật; cả xác thực API Key lẫn HMAC đã có kiểm thử tự động nhưng chưa gọi tài khoản thật.
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
