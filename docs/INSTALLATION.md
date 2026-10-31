# Cài đặt trên Windows, không cần Docker

Máy có Docker có thể dùng [hướng dẫn Docker](DOCKER.md) và `run-docker.bat`, không cần các bước cài Python/Node/MySQL dưới đây trên máy host. Hai chế độ sử dụng database riêng, không tự chuyển dữ liệu.

Backend FastAPI và worker tài liệu chạy trong cửa sổ `run.bat`. Frontend production tại `frontend/dist` được FastAPI phục vụ trực tiếp. SQLAlchemy + MySQL/MariaDB lưu dữ liệu; không cần MongoDB hoặc Redis riêng nếu dùng RATE_LIMIT_BACKEND=sql.

## Yêu cầu

- Python 3.12 trở lên; tạo lại .venv trên từng máy, không chép môi trường máy cũ.
- Node.js 22 để cài/build frontend.
- MySQL 8 hoặc MariaDB tương thích; trên máy local đã kiểm thử MariaDB 10.4.32.
- backend/.env có cấu hình local hoặc server phù hợp; giữ bí mật khóa tích hợp.

## Chuẩn bị

Nhập `database/schema_mysql.sql` vào database trống theo [hướng dẫn MySQL](../database/HUONG_DAN_MYSQL.md). Hoặc dùng Alembic để tạo schema, không cần làm cả hai.

Trong PowerShell mở tại thư mục source:

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
cd backend
.\.venv\Scripts\python.exe ..\deployment\prepare-mysql.py
cd ..
.\run.bat
```

Nếu .venv hợp lệ đã tồn tại, bỏ qua bước tạo venv. Chạy từng lệnh đúng thứ tự. MySQL phải bật trước khi chạy web.

## Địa chỉ local

- Trang chủ: http://127.0.0.1:8000/
- Đăng nhập/đăng ký: /login, /register
- Người dùng: /app; quản trị: /admin
- Widget test: /widget-test.html
- API: /docs (development); sức khỏe: /health/ready

Đăng ký tài khoản trước rồi cấp admin bằng `python -m app.cli promote-admin email` qua Python của venv trong backend. Không có tài khoản mẫu hoặc mật khẩu mặc định mới.

Đóng cửa sổ run.bat hoặc Ctrl+C để dừng. Khi sửa React, có thể dùng `deployment/run-local.ps1` cho Vite ở cổng 5173 và API ở cổng 8001; script đọc cùng DATABASE_URL, không tự đổi database.

## Kiểm thử

Chạy `pytest` trong backend mặc định dùng SQLite tạm. MySQL concurrency test cần TEST_DATABASE_URL trỏ database test riêng, tên bắt đầu ccnlthd_test_ hoặc kết thúc _test. Fixture tạo/xóa bảng test; không dùng ccnlthd. Xem [QUALITY.md](QUALITY.md).
