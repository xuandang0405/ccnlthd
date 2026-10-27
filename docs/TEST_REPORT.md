# Hoàn thiện yêu cầu FastAPI ngày 14/10/2026

Kiểm tra trên source local với Windows/Python 3.14.7 và MySQL 8.4 trong
container test riêng. Không dùng database hoặc file upload của người dùng.

- Ruff app/tests/migrations: đạt.
- MySQL: 77 test đạt; SQLite: 71 đạt, 6 test cần MySQL được bỏ qua.
- Toàn backend app: độ phủ dòng 82,56%, nhánh 57,12%, gộp 78,40%.
  Gate 80% cho errors/observability/security đạt khoảng 95%, không phải toàn app.
- HTTPException/validation/internal error dùng envelope chung; vẫn giữ detail
  để frontend cũ đọc được, giữ Retry-After, không phản chiếu input/ctx nhạy cảm.
- Hash/verify mật khẩu qua AnyIO thread pool; endpoint phục vụ file SPA dùng def.
  Có test thread, token JWT hết hạn, logout/revoke, lifespan và config override.
- Webhook dùng Depends(get_settings); auth API_KEY/HMAC và hợp đồng request không đổi.
- Log access JSON có ID, method/path/status/duration; không ghi body hoặc token.
- Migration trên database HTTP test mới: upgrade head và alembic check đạt.
- HTTP server thật: health ready, auth/422/401, tenant dashboard, admin 403 và API 404.
- Edge headless: Swagger, login, tải dashboard và chặn user vào admin đạt.
  Đây là smoke browser test, chưa phải E2E toàn bộ chức năng.
- Frontend 14 test, ESLint, TypeScript và build đạt; có cảnh báo annotation zod.
- Thử nghiệm async với k6 2.3.0: có throughput/p95, môi trường và số đo gốc.
  Chỉ là I/O giả lập local, không phải kiểm thử tải production hoặc Gemini.

Minh chứng: `docs/FASTAPI_EVIDENCE.md` và `docs/evidence/20261014/`.
Workflow đã bổ sung chạy thủ công, JUnit/coverage XML/HTML và lưu artifact.
Chưa push hoặc chạy GitHub CI theo lựa chọn người dùng; không ghi CI xanh.
Không gọi Gemini/SePay/Telegram/SMTP thật, không thử public HTTPS trong lần này.

# Kết quả Docker ngày 13/10/2026

Source hiện tại ở `D:/QUAN TRỌNG/CCNLTHD/source`. Kiểm tra trên Docker Desktop Linux Engine, Compose và MySQL 8.4, dùng project/volume test riêng, không chạy fixture vào DB local hoặc DB Docker của người dùng.

- Build image FastAPI/Python 3.12 và React/Vite/Nginx thành công. Backend dùng user UID 10001, không chạy root; `.env` không được đóng vào image.
- Compose config và cú pháp PowerShell cho setup/run/backup: đạt. Setup chạy lần hai giữ nguyên secret/mật khẩu.
- MySQL healthy, migration exit 0, backend/frontend healthy, hai worker chạy đúng thứ tự; Alembic check không có chênh lệch schema.
- 43 test backend pass trên MySQL 8.4 trong container. SQLite local: 37 pass, 6 bài MySQL concurrency bỏ qua đúng điều kiện.
- Frontend lint và 14 test pass, gồm regression test trang widget dùng origin hiện tại và chỉ nạp khi có UUID công khai hợp lệ. Build có cảnh báo annotation zod cũ, không phải lỗi.
- HTTP qua Nginx: trang chủ/user/admin/docs, OpenAPI, API JSON 404, CORS/preflight, đăng ký và quyền admin: đạt.
- Ticket kèm file, upload XLSX qua worker riêng, duyệt tay, phiên widget và CSP iframe: đạt. Không gọi Gemini hoặc Telegram thật.
- Webhook với dữ liệu giả: sai auth trả 401, nhận webhook hợp lệ cấp lượt, gọi lặp không cộng lại: đạt; không chuyển tiền thật.
- Dừng/chạy lại: JWT/session, số dư, trạng thái duyệt và file upload còn nguyên.
- `backup-docker.ps1` xuất SQL và tar.gz ra host, tính được SHA-256; chưa thử restore bản dump Docker này trong lần kiểm tra.
- `run-docker.ps1` chạy foreground, in URL/log và Ctrl+C dừng toàn bộ container test. Đóng cửa sổ cưỡng bức cần kiểm tra và dùng stop-docker.bat nếu còn container chạy.

Đã dọn container/volume thuộc project `trolyviet-docker-test` sau kiểm tra. Image và `.env.docker` được giữ để người dùng chạy `run-docker.bat`; không để web chạy ngầm. Dữ liệu local/MongoDB cũ không tự chuyển hoặc xóa.

Chưa kiểm chứng trong lần Docker này: browser E2E, Gemini/SePay/Telegram/SMTP thật, HTTPS Caddy public, DNS/Cloudflare Tunnel hoặc tự chuyển dữ liệu local vào Docker. Đây là kiểm thử chức năng/concurrency có kiểm soát, không phải kiểm thử tải production.

## Kết quả chuyển MySQL ngày 10/10/2026

Kiểm tra trên Windows, Python 3.14.7 và MariaDB 10.4.32 local; các database test được tạo riêng rồi xóa, không dùng `ccnlthd`.

- Ruff backend/API/worker/test/migration và hai script MySQL: đạt.
- SQLite: 37 test pass, 6 test concurrency bỏ qua vì cần MySQL.
- MariaDB: 43 test pass, gồm transaction, phân quyền tenant/admin và các luồng đồng thời.
- Import thủ công `database/schema_mysql.sql`: 30 bảng nghiệp vụ + `alembic_version`, `alembic check` không có khác biệt với ORM.
- Alembic: tạo database trống, upgrade, downgrade và upgrade lại thành công trên database test.
- HTTP với Uvicorn thật: health ready, frontend đã build, auth/roles, dashboard, ticket/attachment, upload XLSX với worker riêng, duyệt tay và phiên widget: đạt. Notification worker khởi động; retry lỗi có test riêng, không gửi Telegram thật.
- Backup MySQL và nhập lại vào database test trống: schema khớp, số bản ghi từng bảng khớp manifest; tiếng Việt, dấu nháy, gạch chéo được giữ.
- Frontend lint, 13 test, TypeScript + Vite build: đạt. Có cảnh báo annotation của dependency zod, không làm build thất bại.
- PowerShell: kiểm tra cú pháp các script chạy/deploy/backup. Chưa chạy trọn cửa sổ `run.bat` trên database `ccnlthd` vì giữ database trống chờ người dùng tự import schema.

Giữ nguyên 66 đường dẫn OpenAPI. Không sửa frontend trong lần chuyển database này. `ccnlthd` vẫn 0 bảng trước khi bàn giao; MongoDB cũ và file upload không bị xóa hoặc tự chuyển dữ liệu.

Chưa kiểm chứng: GitHub CI thực tế, MySQL 8 server thật (máy này dùng MariaDB), browser E2E/load test quy mô lớn, giao dịch SePay/Gemini/Telegram/SMTP thật và Cloudflare Tunnel production. Concurrency test chỉ là các tình huống có kiểm soát, không phải kiểm thử tải toàn hệ thống.

## Kết quả lịch sử ngày 02/10/2026 (trước khi chuyển MySQL)

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
