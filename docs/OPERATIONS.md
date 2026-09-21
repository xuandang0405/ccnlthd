# Vận hành

## Hằng ngày

- Kiểm tra `/health/ready`, dung lượng đĩa, RAM, CPU, trạng thái container và worker.
- Xem lỗi có request ID: `docker compose logs --since 24h backend worker notification-worker caddy`.
- Theo dõi payment `PENDING/REVIEW`, tài liệu `FAILED`, quota và chi phí Gemini.
- Không in API key/token/raw dữ liệu khách hàng vào ticket hoặc log.

## Tài liệu kẹt

Worker tự đưa job `PROCESSING` cũ về luồng xử lý khi restart. Xem `processing_error`, sửa nguyên nhân và gọi endpoint retry. File `FAILED` không được dùng cho RAG.

## Super admin

Sau khi đăng ký tài khoản đầu tiên, cấp quyền trực tiếp trên host tin cậy:

```powershell
docker compose exec backend python -m app.cli promote-admin owner@example.com
```

Sau đó mở `/admin`. Không cung cấp lệnh này cho tenant.

## Sự cố

Nếu nghi lộ secret: vô hiệu hóa/rotate tại nhà cung cấp, cập nhật secret runtime, restart service, rà audit/access log, rồi mới xử lý Git history nếu cần. Nếu Redis lỗi, chat bị đóng có kiểm soát thay vì mở quota vô hạn.
