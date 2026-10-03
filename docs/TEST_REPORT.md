# Báo cáo kiểm thử gần nhất

Ngày kiểm tra: 2026-10-02, Windows, trong workspace hiện tại. Không dùng dữ liệu production cho test.

## Đã xác minh trong lần này

- Backend `ruff check app tests`: đạt.
- `pytest --collect-only -q`: thu thập được 33 test; OpenAPI được sinh và endpoint login khai báo request schema, response 200/422.
- Frontend `npm test`: 7/7 test API và component quota đạt.
- Frontend `npm run lint`, TypeScript `tsc -b` và `npm run build`: đạt. Vite có cảnh báo về annotation ở dependency `zod`, không phải lỗi build.
- File workflow CI đọc được dưới dạng YAML.

## Chưa xác minh trong lần này

- Chưa chạy toàn bộ `pytest`: máy hiện tại không có MongoDB replica set test ở `127.0.0.1:27017`. Cấu hình CI đã được bổ sung để dựng MongoDB riêng, nhưng phải xem lần chạy GitHub Actions thực tế trước khi tuyên bố CI xanh.
- Chưa có browser E2E, kiểm thử tải/concurrency, hoặc tập đánh giá Gemini bằng dữ liệu khách hàng thật. Bộ test retrieval nhỏ chỉ kiểm tra truy xuất từ dữ liệu giả lập.
- Chưa thực hiện giao dịch SePay, gửi Telegram/SMTP, khôi phục backup và kiểm tra Cloudflare Tunnel thật trong lần này.

Không coi mục “thu thập test” là “test đã pass”. Kết quả cũ trước khi chuyển sang MongoDB không còn là bằng chứng cho bản hiện tại.
