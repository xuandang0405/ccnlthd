# Checklist trước khi phát hành cho người dùng thật

## Mã nguồn và kiểm thử

- [x] Backend có request/response schema, auth/tenant check, health check và log request ID.
- [x] Frontend có lint, build, test API và component quota tối thiểu.
- [x] Có handler lỗi chung, schema ErrorResponse, log access JSON và test lifecycle/async hashing.
- [x] Có đồ thị dependency SQL và bảng phủ kỹ thuật; xem FASTAPI_EVIDENCE.md.
- [x] Smoke browser local ngày 14/10: Swagger, login, dashboard và chặn user vào admin.
- [x] Có workflow CI cho backend/frontend, SQLite và MySQL test tách biệt (chưa xác nhận lần chạy GitHub).
- [ ] Xác nhận một PR thực tế có CI xanh, reviewer khác người viết và lịch sử merge rõ ràng.
- [x] Chạy backend pytest trên MariaDB local riêng; xem kết quả chuyển MySQL ngày 10/10/2026 trong TEST_REPORT.md.
- [ ] Bổ sung browser E2E cho đăng nhập, quyền admin, upload/duyệt tài liệu, widget và thanh toán.
- [ ] Đánh giá câu trả lời AI trên tập dữ liệu được phép sử dụng, đo độ đúng của giá/nguồn và tỷ lệ trả lời sai.

## Cấu hình và bảo mật

- [x] Có `.env.example`; `.env` được Git bỏ qua.
- [ ] Đổi các API key/mật khẩu từng chia sẻ ngoài secret store; kiểm tra Git history và máy triển khai không lộ secret.
- [ ] Kiểm tra lại quyền user/admin, tenant isolation, upload sai định dạng, CORS/domain và webhook sai xác thực trên bản phát hành.
- [ ] Kiểm tra HTTPS, DNS/Cloudflare Tunnel, `APP_DOMAIN` và public URL trên máy chủ thật.
- [ ] Hoàn thiện chính sách lưu/xóa dữ liệu, quét file độc hại, cảnh báo và kế hoạch xử lý sự cố.

## Vận hành và tích hợp

- [ ] Backup MySQL và uploads, thử restore trên môi trường tách biệt.
- [ ] Xác minh Gemini key/model/quota và lỗi khi API tạm quá tải.
- [ ] Đối soát một giao dịch SePay thật trước khi bật thanh toán cho khách.
- [ ] Thử Telegram/SMTP thật nếu những tính năng đó được bật.
- [ ] Thử restart máy/server, health check và quy trình quay lại phiên bản trước.

Không coi các ô chưa đánh dấu là đã hoàn thành chỉ vì code có sẵn; cần biên bản kiểm tra hoặc kết quả CI/vận hành tương ứng.
