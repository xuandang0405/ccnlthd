# Đối chiếu báo cáo mới

Nguồn đối chiếu: `Các_công_nghệ_lập_trình_hiện_đại (1).pdf`, 136 trang, SHA-256 `8141C7A706A71DDD70C724875249A11E61CCA8578A40E8A9F5C44FB3AC0A5C88`.

## Nội dung đã đồng bộ

- FastAPI, JWT, phân quyền chủ doanh nghiệp, chat widget, tài liệu PDF/DOCX/XLSX, lead, Telegram worker, SePay, request ID, health check và OpenAPI.
- Free quota mặc định 20 tin nhắn/ngày; phản hồi chat có `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; khi hết quota có thêm `Retry-After`.
- Alias tương thích báo cáo: `POST /api/v1/documents/upload`, `POST /api/v1/payment/seepay-webhook`, `GET /api/v1/health`. API widget đầy đủ nằm dưới `/api/v1/public/chat/{public_id}` để ràng buộc chatbot và visitor session an toàn hơn endpoint chat chung trong báo cáo.
- Webhook SePay hỗ trợ cả API Key và HMAC-SHA256. HMAC dùng raw body, `X-SePay-Signature`, `X-SePay-Timestamp` và chống replay theo cửa sổ thời gian cấu hình.
- GitHub Actions chạy lint/test backend và lint/build frontend.
- `run.bat` có fallback Windows không Docker.

## Khác biệt có chủ đích

- Mật khẩu dùng Argon2 thay vì bcrypt vì đây là lựa chọn hiện đại, không làm thay đổi chức năng đăng nhập.
- Quota Redis production hết hạn vào 00:00 theo múi giờ Việt Nam thay vì cố định 24 giờ kể từ request đầu, đúng nghĩa quota theo ngày.
- Chế độ local không Docker dùng SQLite và quota trong bộ nhớ. Nó không thay thế PostgreSQL/Redis khi triển khai nhiều instance.
- Không coi các tích hợp thật là đã nghiệm thu khi chưa có Gemini API key, Telegram bot token, SePay secret/API key, tài khoản ngân hàng, domain và HTTPS thật.
