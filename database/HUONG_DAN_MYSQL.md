# Chạy Trợ Lý Việt với SQLAlchemy + MySQL

Backend hiện lưu dữ liệu bằng SQLAlchemy ORM và driver async `aiomysql`. Alembic quản lý phiên bản schema. API và frontend không đổi.

Hướng dẫn dùng MySQL 8.4. Ví dụ local bên dưới dùng `127.0.0.1:3306`, tài khoản `root`, mật khẩu trống và database `ccnlthd`. Có thể cài MySQL trực tiếp hoặc chạy Docker theo [hướng dẫn Docker](../docs/DOCKER.md).

## 1. Nhập schema thủ công

- Bật dịch vụ MySQL/MariaDB. Nếu dùng XAMPP, bấm **Start** ở dòng MySQL.
- Mở phpMyAdmin hoặc MySQL Workbench và chọn database `ccnlthd` còn trống.
- Chọn **Import**, chọn `source/database/schema_mysql.sql`, định dạng SQL, rồi thực hiện nhập.
- File tạo 29 bảng nghiệp vụ và bảng `alembic_version`. Không chứa tài khoản, mật khẩu hay dữ liệu mẫu; không có lệnh xóa bảng.
- File có `CREATE DATABASE IF NOT EXISTS ccnlthd` và `USE ccnlthd`. Nếu muốn tên khác, sửa cả hai dòng này và `DATABASE_URL` trước khi nhập.

Chỉ nhập file một lần vào database trống. Nếu thấy lỗi “table already exists”, dừng và kiểm tra; không xóa database đang có dữ liệu để nhập lại. Nếu database chưa có bảng, có thể dùng `alembic upgrade head` thay cho import SQL; chọn một trong hai cách, không cần làm cả hai.

File SQL đã ghi revision Alembic `20261022_chat_retry`, nên không cần `alembic stamp head` sau khi import thành công. Không tự sửa revision để che lỗi thiếu bảng.

## 2. Cấu hình local

Trong `source/backend/.env`:

```dotenv
DATABASE_BACKEND=sql
DATABASE_URL=mysql+aiomysql://root@127.0.0.1:3306/ccnlthd?charset=utf8mb4
RATE_LIMIT_BACKEND=sql
```

Không cần dấu `:` sau `root` vì mật khẩu đang trống. Các khóa Gemini, SePay và `APP_SECRET_KEY` vẫn giữ cấu hình riêng trong `.env`, không đưa vào Git. `MONGODB_URI` và `MONGODB_DATABASE` cũ không còn được backend sử dụng.

Tài khoản `root` không mật khẩu chỉ phù hợp để test local. Khi đưa lên server, tạo tài khoản riêng có mật khẩu và chỉ cấp quyền trên database của dự án. Nếu mật khẩu có ký tự đặc biệt, URL-encode phần mật khẩu khi viết `DATABASE_URL`. Không mở cổng MySQL ra Internet.

## 3. Cài thư viện, build và chạy

Mở PowerShell trong `source`, chạy lần lượt:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
cd backend
.\.venv\Scripts\python.exe ..\deployment\prepare-mysql.py
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic check
cd ..
.\run.bat
```

Nếu chưa có `.venv`, tạo bằng `py -3.12 -m venv backend/.venv` trước khi cài. Không sao chép `.venv` từ máy khác.

`prepare-mysql.py` chỉ kiểm tra kết nối, các bảng và phiên bản; không tạo/xóa dữ liệu. `run.bat` kiểm tra schema trước khi khởi động FastAPI và worker tài liệu. Frontend đã build được FastAPI phục vụ, nên không cần Vite riêng. Chỉ khi giữ cửa sổ `run.bat` mở thì website mới hoạt động.

- Trang chủ: `http://127.0.0.1:8000/`
- Đăng ký/đăng nhập: `/register`, `/login`.
- Khách hàng: `/app`; quản trị: `/admin`.
- Tài liệu API: `/docs` khi `APP_ENV=development`.
- Kiểm tra: `/health/ready`, kết quả phải có `status: ready`.

Nếu muốn sửa frontend bằng Vite, dùng `deployment/run-local.ps1`; giao diện ở cổng 5173 và backend ở cổng 8001. Script này cũng sử dụng database trong `.env`, không tự đổi sang database khác.

## 4. Tài khoản quản trị và dữ liệu cũ

Đăng ký tài khoản của bạn trên web trước. Sau đó, trong thư mục `backend`, cấp quyền quản trị:

```powershell
.\.venv\Scripts\python.exe -m app.cli promote-admin email-cua-ban@example.com
```

Đăng nhập lại và mở `/admin`. Không sửa trực tiếp password hash trong database.

Lần chuyển này thay backend và schema, **không tự nhập tài khoản/tài liệu/giao dịch từ MongoDB**. MongoDB cũ và các tệp upload vẫn được giữ nguyên, không bị xóa. Database MySQL mới bắt đầu trống; đăng ký mới để test. Nếu cần chuyển dữ liệu thật, phải sao lưu và lập bước nhập dữ liệu riêng, giữ nguyên UUID, quan hệ sở hữu và trạng thái thanh toán. Không chạy công cụ MongoDB cũ để “migration” cho MySQL.

## 5. Khi thay đổi model về sau

```powershell
# Chạy trong backend, trên database phát triển đã có schema đúng.
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "mo_ta_thay_doi"
# Đọc file sinh ra trong migrations/versions và sửa nếu cần.
# Sao lưu trước khi áp dụng trên database có dữ liệu.
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic check
```

Migration đang dùng là `backend/migrations/`, do `backend/alembic.ini` trỏ tới. Bộ migration SQL cũ và công cụ MongoDB đã được tách khỏi source đang chạy. Các revision trong `backend/migrations/` được giữ nguyên để nâng cấp database hiện có. Không dùng `downgrade base` trên dữ liệu thật: thao tác này xóa các bảng của dự án.

`schema_mysql.sql` là bản khởi tạo, không phải bản backup hay script nâng cấp. Những thay đổi tiếp theo phải đi qua migration mới.

## 6. Kiểm thử an toàn

`pytest` mặc định dùng SQLite tạm trong bộ nhớ, không đụng `ccnlthd`. Kiểm thử khóa/giao dịch đồng thời cần MySQL riêng:

```powershell
# Tạo một database test trống trước, ví dụ ccnlthd_test_local.
$env:TEST_DATABASE_URL="mysql+aiomysql://root@127.0.0.1:3306/ccnlthd_test_local?charset=utf8mb4"
.\.venv\Scripts\python.exe -m pytest
Remove-Item Env:TEST_DATABASE_URL
```

Fixture test tạo/xóa bảng trong database test trước và sau mỗi bài. Tuyệt đối không dùng `ccnlthd` hoặc database chứa dữ liệu thật làm test. Fixture từ chối tên không thuộc mẫu test. SQLite không thay thế được việc kiểm tra `FOR UPDATE`, khóa và concurrency trên MySQL.

## 7. Sao lưu

Từ `source`, chạy `deployment/backup-server.ps1`. Script xuất schema và dữ liệu MySQL ra `.runtime/backups/mysql-*.zip`; nếu có file upload thì tạo thêm `uploads-*.zip`. ZIP database chứa `mysql.sql` và `manifest.json` ghi số bản ghi từng bảng.

Giải nén, chọn một database phục hồi **trống**, nhập `mysql.sql`, đối chiếu số bản ghi với manifest và kiểm tra `alembic check` trước khi đổi cấu hình. SQL backup không chứa `USE` hoặc `DROP TABLE`, nên không tự chọn/xóa database. Bảo vệ file backup như dữ liệu khách hàng; tạm dừng server/worker khi sao lưu cả DB và upload để hai phần khớp nhau.

Tài liệu tham khảo: [SQLAlchemy async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), [dialect MySQL/MariaDB](https://docs.sqlalchemy.org/en/20/dialects/mysql.html), [Alembic](https://alembic.sqlalchemy.org/en/latest/tutorial.html), [FastAPI dependency scope](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/#early-exit-and-scope). Dependency session dùng scope function để commit trước khi gửi response; pyproject.toml yêu cầu FastAPI từ 0.121.1.
