# Backup và restore

Chạy từ thư mục repository khi stack đang hoạt động:

```powershell
.\deployment\backup.ps1 -Destination D:\Backups\ai-sales
```

Script tạo PostgreSQL custom dump và archive uploads, rồi in SHA-256. Sao chép ít nhất một bản ra thiết bị hoặc vị trí ngoài máy chủ, mã hóa và áp dụng retention.

Restore là thao tác phá hủy dữ liệu hiện tại:

```powershell
.\deployment\restore.ps1 -DatabaseBackup D:\Backups\ai-sales\database-TIMESTAMP.dump -UploadsBackup D:\Backups\ai-sales\uploads-TIMESTAMP.tar.gz -ConfirmRestore
```

Sau restore: chạy `/health/ready`, đăng nhập, kiểm tra số tenant/chatbot/document, mở file mẫu và đối chiếu checksum. Hai script chưa được chạy trên máy này vì Docker chưa khả dụng; bắt buộc diễn tập restore trên môi trường tách biệt trước production.
