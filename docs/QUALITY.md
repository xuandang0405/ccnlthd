# Quy trình Tầng 2: kiểm thử và làm việc nhóm

## Chạy các kiểm tra

Backend: cài `pip install -e ".[dev]"` trong `backend`, chạy `ruff check app tests` và `pytest --cov=app`. Bộ test API/integration cần MongoDB replica set riêng; khi không đặt `TEST_MONGODB_URI`, chúng mặc định kết nối localhost. Fixture xóa `ai_sales_assistant_test` trước/sau mỗi test. **Không dùng URI Atlas production làm `TEST_MONGODB_URI`.** Nếu máy cá nhân không có MongoDB test, đẩy nhánh lên GitHub và xem job CI; không coi việc bỏ qua pytest là đã pass.

Frontend: trong `frontend`, chạy `npm ci`, `npm run lint`, `npm test`, `npm run build`. Test hiện dùng Node test runner để kiểm tra luồng request: gửi token/tenant, hiển thị lỗi 422 và request ID, xử lý server trả HTML, upload FormData; đồng thời render component quota để kiểm tra cảnh báo và số dư. Chưa có browser E2E đầy đủ; cần bổ sung trước khi coi UI là đã kiểm chứng toàn diện.

CI ở `.github/workflows/ci.yml` chạy khi push/PR: Python 3.12 với MongoDB replica set tạm, lint + pytest; Node 22 với lint + test + build. MongoDB trong GitHub Actions chỉ phục vụ CI; máy Windows chạy website không cần Docker.

## Đánh giá phần AI

`backend/tests/data/retrieval_cases.json` là bộ câu hỏi-sản phẩm nhỏ, có đáp án mong đợi. `test_retrieval_evaluation.py` kiểm tra truy xuất đúng sản phẩm đầu tiên và từ chối đánh dấu “đã tìm thấy” khi mã sản phẩm không có. Đây là **đánh giá tầng retrieval có dữ liệu giả lập**, không chứng minh Gemini trả lời đúng hay giá trên tài liệu khách hàng thật luôn chính xác. Khi có dữ liệu được phép sử dụng, nhóm cần bổ sung tập câu hỏi thực tế đã ẩn danh, đáp án/nguồn chuẩn, tỷ lệ trả lời đúng và tỷ lệ bịa thông tin; chạy lại sau mỗi thay đổi model/prompt/index.

## Quy trình Git và review

1. Mỗi thay đổi tạo nhánh riêng từ `main`, commit mô tả mục đích và không chứa `.env`, token hoặc dữ liệu khách hàng.
2. Mở PR/MR; mô tả mục tiêu, phạm vi, ảnh giao diện nếu có, kết quả lint/test/build, và rủi ro migration/cấu hình.
3. Thành viên khác review code và thử luồng liên quan. Chỉ merge khi CI xanh và các ý kiến quan trọng đã xử lý.
4. Trước deploy: backup MongoDB + uploads, xác minh cấu hình/domain, chạy health check, thử luồng user/admin/widget/thanh toán bằng tài khoản test, chuẩn bị phương án quay lại.

Lịch sử commit hiện có không tự chứng minh review chéo. Giữ link PR, reviewer và kết quả CI làm minh chứng khi nộp báo cáo.
