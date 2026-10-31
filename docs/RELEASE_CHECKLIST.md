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
- [x] Demo browser local ngày 22/10: đăng nhập, quyền admin, upload/duyệt/thu hồi tài liệu, hai tenant, worker lỗi/thử lại, widget khác origin, ticket có ảnh, QR và webhook tự ký local. Có ảnh và request ID trong `docs/evidence/20261022/`; không phải nghiệm thu SePay thật.
- [ ] Đưa các kịch bản browser vào bộ E2E tự động chạy ổn định trong CI và kiểm tra trên bản triển khai.
- [ ] Đánh giá câu trả lời AI trên tập dữ liệu được phép sử dụng, đo độ đúng của giá/nguồn và tỷ lệ trả lời sai.

## Cấu hình và bảo mật

- [x] Có `.env.example`; `.env` được Git bỏ qua.
- [ ] Đổi các API key/mật khẩu từng chia sẻ ngoài secret store; kiểm tra Git history và máy triển khai không lộ secret.
- [ ] Kiểm tra lại quyền user/admin, tenant isolation, upload sai định dạng, CORS/domain và webhook sai xác thực trên bản phát hành.
- [ ] Kiểm tra HTTPS, DNS/Cloudflare Tunnel, `APP_DOMAIN` và public URL trên máy chủ thật.
- [ ] Hoàn thiện chính sách lưu/xóa dữ liệu, quét file độc hại, cảnh báo và kế hoạch xử lý sự cố.

## Vận hành và tích hợp

- [x] Diễn tập backup/restore local ngày 22/10 trên MySQL riêng: 32 bảng tính cả Alembic, 4 tệp upload khớp hash; `alembic check` đạt. Xem `docs/evidence/20261022/restore-evidence.json`.
- [ ] Thiết lập backup ngoài máy chủ, lịch sao lưu và diễn tập phục hồi môi trường production.
- [ ] Xác minh Gemini key/model/quota và lỗi khi API tạm quá tải.
- [ ] Nghiệm thu SePay Test Mode qua nền tảng thật (chủ dự án chưa có token test), sau đó đối soát giao dịch thật trước khi bật thanh toán cho khách. Webhook tự ký local không thay thế hai bước này.
- [ ] Thử thông báo khách hàng mới trên web, đổi trạng thái và cách ly doanh nghiệp; thử SMTP thật nếu bật email.
- [ ] Thử restart máy/server, health check và quy trình quay lại phiên bản trước.

Không coi các ô chưa đánh dấu là đã hoàn thành chỉ vì code có sẵn; cần biên bản kiểm tra hoặc kết quả CI/vận hành tương ứng.

Kết quả cuối đợt 22/10: MySQL 126 đạt; SQLite cùng bộ test 114 đạt, 12 bỏ qua; frontend 26 đạt. Không cộng hai lượt chạy database hoặc coi coverage 79,33% là phần trăm hoàn thiện. Chi tiết và giới hạn tại [ACCEPTANCE_20261022.md](ACCEPTANCE_20261022.md).
