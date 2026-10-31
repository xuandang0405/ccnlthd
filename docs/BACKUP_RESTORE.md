# Backup và restore MySQL

## Docker

Khi MySQL và backend Docker đang chạy, từ source:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deployment\backup-docker.ps1
```

Script gọi mysqldump trong container và copy ra `.runtime/backups/docker`, gồm `mysql-*.sql`, `uploads-*.tar.gz`, in SHA-256 để đối chiếu. Có thể truyền `-Destination` để chọn thư mục khác. Dữ liệu không bị xóa hoặc ghi đè.

Nếu cần hai phần DB/upload khớp nhau, chặn truy cập và tạm dừng worker tài liệu trong lúc backup; không chạy migration hoặc thay đổi tài liệu lúc ấy. Phục hồi phải diễn tập ở database/volume riêng trước, không nhập đè dữ liệu thật.

## Môi trường không Docker

Từ thư mục source:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\backup-server.ps1
```

Script tạo mysql-TIMESTAMP.zip và SHA-256 trong .runtime/backups. Nếu có file upload, tạo thêm uploads-TIMESTAMP.zip. ZIP database chứa mysql.sql (schema + dữ liệu) và manifest.json (số bản ghi mỗi bảng).

Không tự xóa backup cũ. Cất bản sao ngoài máy chủ và bảo vệ quyền truy cập vì backup có dữ liệu khách hàng và password hash. Tạm dừng backend/worker khi cần đồng bộ database với upload. Backup database dùng một transaction consistent snapshot; không chạy migration trong lúc sao lưu.

Để diễn tập phục hồi:

1. Tạo database phục hồi trống, không dùng database thật.
2. Giải nén ZIP, chọn database mới và nhập mysql.sql.
3. Đối chiếu số bản ghi với manifest.json, kiểm tra khóa ngoại và file upload.
4. Trỏ cấu hình môi trường thử vào database phục hồi; chạy prepare-mysql.py, alembic check và health/ready.
5. Kiểm tra đăng nhập, số tenant/chatbot/document, số dư và file mẫu trước khi đổi cấu hình thật.

SQL backup không có USE hoặc DROP TABLE: người thực hiện phải chọn đúng database trống. Không dùng schema_mysql.sql để thay thế backup, vì schema khởi tạo không có dữ liệu.

Bản backup MongoDB hoặc PostgreSQL cũ cần được giữ riêng theo phiên bản. Các công cụ của hai hệ thống cũ đã được tách khỏi source MySQL hiện tại.
