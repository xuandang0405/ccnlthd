# AI Sales Assistant SaaS

Nền tảng trợ lý bán hàng đa doanh nghiệp bằng FastAPI, React, MongoDB Atlas và Google Gemini. Source hiện có luồng đăng ký/đăng nhập, cách ly tenant, chatbot, kho tài liệu PDF/DOCX/XLSX, worker bền qua restart, widget khách truy cập, hội thoại, lead, quota, đơn thanh toán VietQR/SePay, kích hoạt subscription và trang super admin.

Production Windows hiện tại: [https://seminar.bkpvp.top](https://seminar.bkpvp.top), đi qua Cloudflare Tunnel tới FastAPI chỉ bind trên localhost. Dữ liệu nghiệp vụ và bộ đếm quota/rate-limit đều nằm trên MongoDB Atlas. Xem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Khởi động nhanh trên Windows

Nhấp đúp [run.bat](run.bat). Script tự chọn cách chạy:

- Có Docker đang hoạt động: chạy backend, worker, Redis và Caddy tại `http://localhost`.
- Không có Docker: chạy trực tiếp bằng Python + Node và MongoDB Atlas tại `http://127.0.0.1:5173`.

Chế độ không Docker cần Python 3.12+, Node.js 20+ và `MONGODB_URI` hợp lệ trong `backend/.env`. Script tự tạo virtual environment, cài dependency khi thiếu, kiểm tra MongoDB, chạy hai worker và mở trình duyệt.

Để triển khai production-like bằng Docker:

```powershell
Copy-Item .env.example .env
# Điền MONGODB_URI, secret, domain và các tích hợp thật.
docker compose up -d --build
docker compose ps
```

Backend tự kiểm tra kết nối và index MongoDB khi khởi động. Truy cập `https://APP_DOMAIN/`; health tại `/health/live` và `/health/ready`.

Chi tiết cài đặt không Docker nằm tại [docs/INSTALLATION.md](docs/INSTALLATION.md). Đối chiếu với báo cáo mới nằm tại [docs/REPORT_ALIGNMENT.md](docs/REPORT_ALIGNMENT.md).

## Những gì chưa được xác minh trên máy này

- Gemini thật cần theo dõi quota và lỗi của model trong quá trình vận hành.
- Telegram thật: có luồng challenge xác minh destination và worker retry hữu hạn, nhưng chưa có Bot Token/destination thật để kiểm chứng gửi.
- SePay webhook thật vẫn cần đối soát một giao dịch ngân hàng thực tế.
- Restore MongoDB cần được diễn tập định kỳ trên database tách biệt.

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
