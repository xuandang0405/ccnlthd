# Triển khai

Đã có cấu hình Docker chạy MySQL, migration, API, worker tài liệu và frontend: xem [DOCKER.md](DOCKER.md). Với Docker, Cloudflare Tunnel trên host trỏ tới cổng 8080; các bước bên dưới mô tả cách chạy không Docker ở cổng 8000.

Luồng một máy: trình duyệt → HTTPS/Cloudflare Tunnel (nếu dùng domain) → FastAPI 127.0.0.1:8000 → SQLAlchemy + MySQL. FastAPI phục vụ API và frontend đã build; worker tài liệu chạy cùng run.bat. Thông báo khách hàng mới đọc trực tiếp qua API khi mở web, không có worker gửi tin riêng. Máy chạy website không cần Docker.

## Chuẩn bị

Làm theo [INSTALLATION.md](INSTALLATION.md) và [hướng dẫn MySQL](../database/HUONG_DAN_MYSQL.md). Cấu hình backend/.env theo domain thật; APP_PUBLIC_URL, FRONTEND_ORIGIN, APP_DOMAIN cần thống nhất. Cloudflare Tunnel trỏ tới http://127.0.0.1:8000, không đưa HTTPS trực tiếp vào Uvicorn HTTP.

Trên server không dùng root không mật khẩu. Tạo tài khoản MySQL riêng, giữ cổng DB trong mạng riêng/localhost. Nếu tự dùng Docker, DATABASE_URL phải là hostname DB mà container truy cập được, không phải 127.0.0.1 của máy Windows; cấu hình này chưa được kiểm thử trong lần chuyển đổi local.

## Cập nhật

1. Sao lưu database và backend/storage/uploads; đối chiếu và cất một bản ngoài máy chủ.
2. Dừng run.bat, cập nhật source, giữ .env riêng trên máy triển khai.
3. Cài backend qua venv, npm ci và npm run build. Nếu có migration mới, đọc migration và chạy alembic upgrade head sau khi sao lưu.
4. Chạy deployment/prepare-mysql.py bằng venv trong backend để kiểm tra schema.
5. Mở run.bat, kiểm tra health/ready, đăng nhập và thử widget bằng tài khoản test.

deployment/deploy-server.ps1 vẫn sao lưu và build, nhưng chỉ kiểm tra schema, không tự nhập SQL hoặc xóa dữ liệu. run.bat chỉ khởi động khi cửa sổ mở và không tự cài package/build/migrate. Các URL hiển thị lấy từ APP_PUBLIC_URL.

## Kiểm tra trước công bố

- Schema đúng phiên bản Alembic, MySQL kết nối được.
- Secret mạnh, CORS/domain đúng; /docs tắt ở production.
- Quyền user/admin và cách ly tenant.
- Upload, duyệt tài liệu và xử lý worker.
- Gemini thật: quota, model và timeout.
- Webhook SePay thật và đối soát ngân hàng; kiểm tra thông báo khách hàng mới trên web.
- Sao lưu/phục hồi thử trên database riêng.

Không xóa MongoDB cũ trước khi chốt cách giữ/chuyển dữ liệu. Bản MySQL mới chưa tự nhập dữ liệu MongoDB.
