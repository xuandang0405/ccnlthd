# Báo cáo kiểm thử

Ngày chạy local: 2026-09-22, Windows, Python 3.14.7 cho test (source yêu cầu/ảnh Docker dùng Python 3.12), Node/Vite local.

## Đã chạy thành công

- Ruff: không lỗi.
- Pytest: 11 passed; gồm auth/refresh/reset, cross-tenant chatbot, upload độc hại/hợp lệ, Gemini thiếu cấu hình báo lỗi thật, widget session/chat và rate-limit headers, lead/hội thoại, SePay API Key/HMAC/idempotency/subscription, Telegram challenge và super-admin authorization.
- Coverage: 72%; worker/parser/notification worker có nhánh chưa cover.
- Frontend ESLint và TypeScript/Vite production build: pass.
- `npm audit --omit=dev`: 0 vulnerability được báo.
- Alembic SQLite: upgrade/downgrade/upgrade đã chạy ở giai đoạn phát triển.
- Visual QA thủ công: trang chủ, đăng ký ở viewport hẹp và dashboard shell.

## NOT VERIFIED / BLOCKED

- Gemini call thật: thiếu key/model.
- PostgreSQL/Redis và Docker Compose: Docker chưa cài/chạy.
- SePay giao dịch thật, VietQR và đối soát: thiếu tài khoản/cấu hình thật; không thực hiện giao dịch thật.
- Telegram gửi thật: challenge/destination verification có automated test bằng fake transport, nhưng thiếu Bot Token/destination thật.
- Playwright E2E đầy đủ, streaming SSE, SMTP delivery thật và concurrency load test.
- HTTPS/domain/CGNAT/port forwarding/firewall từ Internet.
- Backup/restore và restart trên container thật.

Không suy diễn các mục NOT VERIFIED là pass.
