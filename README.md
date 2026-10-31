# Trợ lý Việt

Website cho thuê và quản lý chatbot tư vấn bán hàng. Người dùng tải tài liệu sản phẩm, tạo chatbot và nhúng vào website của mình.

## Công nghệ

- Backend: FastAPI, Pydantic, SQLAlchemy và Alembic.
- Frontend: React, TypeScript, Vite và Tailwind CSS.
- Database: MySQL 8.4.
- Tích hợp: Gemini, thanh toán VietQR/SePay và Docker Compose.

## Chức năng chính

- Đăng ký, đăng nhập và phân quyền người dùng/admin.
- Tạo chatbot, tải tài liệu và duyệt tài liệu trước khi sử dụng.
- Chat tư vấn, xem hội thoại và quản lý khách hàng tiềm năng.
- Mua lượt chat, phân bổ lượt cho chatbot và thanh toán bằng QR.
- Gửi yêu cầu hỗ trợ kèm ảnh hoặc tệp.

## Chạy bằng Docker

1. Mở Docker Desktop ở chế độ Linux containers.
2. Chạy file `run-docker.bat`.
3. Mở http://127.0.0.1:8080.

Lần đầu chạy, script tạo `.env.docker`. Cập nhật khóa tích hợp trong file này nếu cần dùng Gemini hoặc SePay.

Dừng bằng `Ctrl+C` hoặc `stop-docker.bat`. Hướng dẫn chi tiết: [Chạy Docker](docs/DOCKER.md).

## Chạy không dùng Docker

Cài Python, Node.js và MySQL, sau đó cấu hình theo [hướng dẫn cài đặt](docs/INSTALLATION.md).

Khi đã cài đặt xong, chạy `run.bat` và mở http://127.0.0.1:8000. Giữ cửa sổ chạy mở, nhấn `Ctrl+C` để dừng.

## Các trang

Thêm đường dẫn sau vào địa chỉ website đang chạy:

- `/`: Trang chủ.
- `/login`: Đăng nhập.
- `/app`: Quản lý của người dùng.
- `/admin`: Quản trị, cần tài khoản admin.
- `/widget-test.html`: Thử nhúng chatbot.
- `/docs`: Swagger API khi chạy ở môi trường development.

## Tài liệu

- [Hướng dẫn đọc code](docs/CODE_MAP_FOR_TEAM.md).
- [Hướng dẫn sửa frontend](frontend/HUONG_DAN_CHINH_SUA_FRONTEND.md).
- [Database](docs/DATABASE.md) và [schema MySQL](database/schema_mysql.sql).
- [Kiểm thử](docs/QUALITY.md) và [workflow CI](.github/workflows/ci.yml).