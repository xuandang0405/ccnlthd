# Kiểm thử và giới hạn kiểm chứng

Đợt kiểm tra mới ngày 19/10/2026: [phạm vi sửa, kết quả và giới hạn](COMPLETION_20261019.md).
MySQL đạt 91 test; SQLite đạt 85 và bỏ qua 6 test khóa đồng thời.

## Backend

Trong backend, cài dev dependencies rồi chạy:

```powershell
.\.venv\Scripts\python.exe -m ruff check app tests migrations
.\.venv\Scripts\python.exe -m pytest --cov=app
```

Mặc định test dùng SQLite tạm trong bộ nhớ. MySQL integration/concurrency test cần TEST_DATABASE_URL trỏ vào database riêng, ví dụ ccnlthd_test_local. Fixture tạo/xóa bảng trước và sau từng bài; không dùng database thật. Tên database được kiểm tra để từ chối ccnlthd.

Các test MySQL đồng thời kiểm tra: giới hạn số chatbot, refresh rotation một lần, rate-limit dùng chung, trừ/hoàn lượt, phân bổ lượt và webhook không cộng trùng. SQLite không kiểm chứng được khóa FOR UPDATE nên nhóm concurrency được bỏ qua ở SQLite.

## Frontend và CI

Trong frontend: npm run lint, npm test, npm run build.

.github/workflows/ci.yml chạy Python 3.12 với SQLite và service MySQL 8 tách biệt, kiểm tra Alembic, cùng Node 22 cho lint/test/build. Service Docker chỉ chạy trong CI, máy local không cần Docker. Chưa tuyên bố CI trên GitHub pass khi chưa xem kết quả lần chạy thực tế.

Workflow hỗ trợ workflow_dispatch, xuất JUnit, coverage XML/HTML và lưu artifact
14 ngày. Gate 80% chỉ áp dụng errors/observability/security; báo cáo độ phủ toàn
app được xuất riêng, không che các phần chưa test. Kết quả ngày 14/10/2026 và
bảng phủ yêu cầu có ở docs/FASTAPI_EVIDENCE.md.

Không commit .coverage, coverage.xml, htmlcov hoặc file tạm vào root. Minh chứng
đã kiểm tra và chọn lọc nằm dưới docs/evidence/20261014. CI thực tế chỉ được ghi
đạt khi có link lần chạy đúng commit; local pytest không thay thế bằng chứng đó.

## Thay đổi schema

Nhập schema SQL hoặc alembic upgrade head vào database trống, rồi alembic check để so model với schema. Chỉ thử downgrade/upgrade trên database bỏ đi. Kiểm thử backup/restore vào database trống riêng và đối chiếu dữ liệu.

## Luồng kiểm tra thủ công

- Đăng ký, đăng nhập, hết hạn/refresh phiên.
- User không được gọi API admin; không đọc dữ liệu tenant khác.
- Upload PDF/DOCX/XLSX, xử lý và duyệt trước khi dùng trong chat.
- Chat ghi lịch sử, trừ lượt; lỗi Gemini có fallback và hoàn lượt.
- Thanh toán sai xác thực/sai số tiền không cấp lượt, webhook lặp không cộng lại.
- Ticket, file đính kèm, thông báo chưa đọc và trả lời admin.
- Đóng server, mở lại, kiểm tra phiên và job đang xử lý.

Gemini/SePay/Telegram thật cần kiểm tra riêng; test dùng giả lập tích hợp, không chuyển tiền hoặc gửi thông báo thật.
