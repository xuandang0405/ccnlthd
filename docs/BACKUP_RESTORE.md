# Backup và restore

Máy chủ tự chạy tác vụ sau mỗi ngày; có thể tạo bản sao thủ công từ thư mục repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\backup-server.ps1
```

Script tạo `mongodb-TIMESTAMP.zip`, `uploads-TIMESTAMP.zip` và SHA-256 trong `.runtime/backups`. Database dùng Canonical Extended JSON để giữ nguyên kiểu BSON. Hãy sao chép ít nhất một bản ra vị trí ngoài máy chủ và mã hóa.

Restore ghi đè dữ liệu nên phải diễn tập trên một database Atlas tách biệt trước. Sau restore: chạy `/health/ready`, đăng nhập, kiểm tra số tenant/chatbot/document, mở file mẫu và đối chiếu checksum. Không dùng database production làm nơi diễn tập.
