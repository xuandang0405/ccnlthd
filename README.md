# AI Sales Assistant SaaS

Nền tảng trợ lý bán hàng đa doanh nghiệp bằng FastAPI, React, MongoDB Atlas và Google Gemini. Source hiện có luồng đăng ký/đăng nhập, cách ly tenant, chatbot, kho tài liệu PDF/DOCX/XLSX, worker bền qua restart, widget khách truy cập, hội thoại, lead, quota, đơn thanh toán VietQR/SePay, kích hoạt subscription và trang super admin.

Triển khai Windows dùng Cloudflare Tunnel tới FastAPI chỉ bind trên localhost; domain cần khớp với `backend/.env` và cấu hình Tunnel của máy triển khai. Dữ liệu nghiệp vụ và bộ đếm quota/rate-limit nằm trên MongoDB Atlas. Xem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Khởi động server trên Windows

Nhấp đúp [run.bat](run.bat) để chạy backend FastAPI, worker tài liệu và worker thông báo. Frontend production đã build được FastAPI phục vụ trực tiếp; không cần Docker hoặc một tiến trình frontend riêng.

`run.bat` dọn các PID cũ của chính dự án trước khi chạy và hiển thị toàn bộ log trong cùng cửa sổ. Phải giữ cửa sổ này mở để website hoạt động; nhấn `Ctrl+C` hoặc đóng cửa sổ để dừng server. Dự án không còn tự khởi động khi đăng nhập Windows.

Để triển khai production-like bằng Docker:

```powershell
Copy-Item .env.example .env
# Điền MONGODB_URI, secret, domain và các tích hợp thật.
docker compose up -d --build
docker compose ps
```

Backend tự kiểm tra kết nối và index MongoDB khi khởi động. Truy cập `https://APP_DOMAIN/`; health tại `/health/live` và `/health/ready`.

Chi tiết cài đặt không Docker nằm tại [docs/INSTALLATION.md](docs/INSTALLATION.md). [docs/REPORT_ALIGNMENT.md](docs/REPORT_ALIGNMENT.md) là bản đối chiếu với báo cáo ở giai đoạn trước, không thay cho tài liệu vận hành hiện tại.

API và ví dụ dependency/async nằm tại [docs/API.md](docs/API.md). Quy trình kiểm thử, tập đánh giá truy xuất AI và các giới hạn kiểm chứng nằm tại [docs/QUALITY.md](docs/QUALITY.md).

## Những gì chưa được xác minh trên máy này

- Gemini thật cần theo dõi quota và lỗi của model trong quá trình vận hành.
- Telegram thật: có luồng challenge xác minh destination và worker retry hữu hạn, nhưng chưa có Bot Token/destination thật để kiểm chứng gửi.
- SePay webhook thật vẫn cần đối soát một giao dịch ngân hàng thực tế.
- Restore MongoDB cần được diễn tập định kỳ trên database tách biệt.

Không coi bản này đủ điều kiện production trước khi hoàn tất checklist trong [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Kiểm thử local

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\pip.exe install -e ".[dev]"
.\.venv\Scripts\ruff.exe check app tests
# Chỉ chạy pytest với MongoDB replica set dành riêng cho test.
.\.venv\Scripts\pytest.exe --cov=app

cd ..\frontend
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev
```

Không commit `.env`, API key, token, thông tin ngân hàng hoặc dữ liệu khách hàng. Chỉ push sau khi chủ dự án xác nhận.
