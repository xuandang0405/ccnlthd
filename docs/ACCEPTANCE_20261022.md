# Đối chiếu yêu cầu và nghiệm thu local ngày 22 tháng 10 năm 2026

Đây là bản ghi ngày 22/10, không phải hướng dẫn chạy hiện tại. Thông báo khách hàng đã chuyển về web ngày 24/10; xem [kết quả mới](evidence/20261024-web-notifications/README.md). Số test và số bảng trong các minh chứng cũ vẫn giữ theo đúng mốc kiểm tra.

Phạm vi: hoàn thiện các góp ý còn lại sau bản 19/10, giữ FastAPI + SQLAlchemy async + MySQL/Alembic. Không mở rộng vector search, không đổi kiến trúc, không tự push GitHub. Dữ liệu demo và database kiểm thử riêng; không sửa database nghiệp vụ hoặc `.env` của người dùng.

## 1. Danh sách yêu cầu của giảng viên

| Nhóm yêu cầu | Nội dung phải giải trình | Nơi kiểm tra |
| --- | --- | --- |
| Nền tảng backend | Request qua route, Pydantic, dependency, nghiệp vụ, SQL rồi JSON; path/query/body, APIRouter, HTTP status | `backend/app/api`, `schemas`, OpenAPI |
| ORM và migration | SQLAlchemy đúng loại session, Alembic thật cho database đang chạy | `core/database.py`, `models/entities.py`, `migrations/` |
| Pydantic | Model vào/ra; validation sai kiểu sinh 422 ở tầng FastAPI/Pydantic trước nghiệp vụ | `tests/test_api_contract.py`, `test_lifecycle_and_validation.py` |
| Depends | Auth, session DB, config; graph một endpoint và phạm vi cache/yield | `api/deps.py`, `docs/diagrams`, probe và test config |
| Async đúng chỗ | Chỉ ra await đang chờ I/O; endpoint def chạy thread pool; blocking trong async chặn event loop | `core/security.py`, `app/main.py`, `backend/benchmarks` |
| Lỗi và cấu hình | HTTPException, handler chung, settings, `.env.example`, Uvicorn và README | `core/errors.py`, `core/config.py`, test lỗi |
| Cơ chế tự chọn | Response model, CORS/log, lifespan, httpx/override, JWT theo nhu cầu thật | Các test tương ứng; không mô tả JWT JSON login như OAuth2 password flow |
| Minh chứng | Swagger, graph, mapping file, số liệu kèm môi trường, log request ID | `docs/evidence`, báo cáo chính |
| So sánh và vấn đáp | Công nghệ thay thế, hai trường hợp không nên ưu tiên FastAPI, bốn câu hỏi tự kiểm | Báo cáo 2.1.8 và 4.2.14.2 |
| Chiều sâu đã chọn | Async benchmark, worker riêng, nhất quán quota, quan sát và CI | Code/lệnh/output, JUnit/coverage; CI phải có link run thật |
| Thực hành | Bài lab 30–45 phút riêng; từng người tự làm, chụp code/kết quả, tự nhận xét | Phiếu hands-on cá nhân, không điền thay |

Góp ý mới ngày 22/10 tập trung vào: giữ code/lệnh/output của probe cùng nhau; phân biệt hai bộ test database; retry ở ranh giới transaction; xác thực SePay API Key/HMAC đúng tài liệu; kiểm chứng APPROVED, hai tenant và vòng đời worker trước khi mở rộng retrieval; rút gọn phần lặp, giữ AI Disclosure và lịch sử sửa.

## 2. Đã hoàn thiện trong đợt này

- Retry bền vững đã có bảng `chat_requests` và migration `20261022_chat_retry`. Xem [hợp đồng và giới hạn retry](CHAT_RETRY.md).
- Bổ sung probe độc lập có code tại `backend/benchmarks/probe_mechanisms.py`, lệnh ở README cạnh file và output trong `evidence/20261022/mechanisms/`. Dependency `shared/left/right` là giả; không có kết nối MySQL. Graph/schema app được đọc riêng, không coi là gọi endpoint sản phẩm.
- Mở Edge bằng profile riêng và thao tác website/API thật, không mock UI: tài liệu PENDING không dùng làm nguồn; admin duyệt thì giá/nguồn đúng; Beta không đọc tài liệu Aurora; thu hồi duyệt làm nguồn mới rỗng; worker FAILED rồi thử lại DONE; ticket hai chiều có ảnh; widget trên website khác origin.
- Phát hiện và sửa lỗi fallback không đọc được `Giá bán` trên dòng riêng của Word. Parser gom dòng theo sản phẩm, thêm nhãn giá phổ biến và bảo hành, giữ nguyên khoảng giá thay vì ghép chữ số. Sáu test mới tái hiện lỗi trước khi sửa và đạt sau sửa.
- Sửa panel nguồn trên preview để không giữ tài liệu của câu trước nếu response mới không có nguồn; xóa session cũ khi đổi bot. Sửa hai nhãn/chi tiết nhỏ ở trang tài liệu, không thiết kế lại giao diện.
- Webhook tự ký local kiểm tra chữ ký sai/timestamp cũ 401, hợp lệ 200, lặp 200 nhưng không cấp trùng. Ví test 0 → 100 → 100. Có request ID và đối chiếu SQL. Đây không phải SePay Test Mode.
- Dùng `deployment/backup-mysql.py` xuất dump/manifest và phục hồi vào DB trống khác: 32 bảng tính cả Alembic khớp số hàng/hash tại snapshot, 4 tệp upload khớp hash, `alembic check` đạt.
- Báo cáo chính có bản mới ngày 22/10: thay 24 ảnh demo cũ, sửa phần retry/số bảng/số test, làm rõ probe và tích hợp ngoài, cập nhật mục lục và danh sách hình/bảng. Bản gốc 19/10 được giữ nguyên.

## 3. Kết quả kiểm thử và môi trường

| Hạng mục | Kết quả thực đo |
| --- | --- |
| Backend MySQL 8.4.11, Windows/Python 3.14.7 | 126 đạt, 0 lỗi/bỏ qua; 306,21 giây |
| Cùng bộ test trên SQLite tạm | 114 đạt, 12 bỏ qua cần MySQL; 18,12 giây |
| Frontend | 26 test đạt, TypeScript `tsc -b`, ESLint, Vite build đạt |
| Ruff | `app tests migrations benchmarks/probe_mechanisms.py` đạt |
| Độ phủ MySQL | 2.677/3.214 dòng; 385/646 nhánh; kết hợp 79,33% |
| Browser | Edge, desktop 1440×1000; trang chủ mobile 390×844 không tràn ngang; không ghi nhận pageerror trong các luồng chính |

Không cộng thành 240 test chức năng. Mốc retry đầu ngày có 120 test trước khi thêm 6 test fallback; không dùng mốc đó làm kết quả cuối. Coverage không phải phần trăm hoàn thiện sản phẩm. Probe, browser demo và benchmark không cộng vào số Pytest.

Môi trường demo: MySQL container riêng ở localhost 33079, API 18023, frontend 18024, website nhúng widget 18025. Bộ pytest MySQL dùng DB test khác DB demo. Không phải pytest trong image Python 3.12 và không phải kiểm thử production/public Cloudflare. Các server/container tạm được dọn sau khi lưu minh chứng.

## 4. Những phần chưa nghiệm thu

| Hạng mục | Trạng thái và việc cần làm |
| --- | --- |
| SePay Test Mode | Chủ dự án xác nhận chưa có tài khoản/token test. Cần test qua nền tảng thật, endpoint HTTPS test riêng, lưu request ID và số dư trước/sau. Không chuyển tiền thật trong đợt này. |
| Gemini và AI tự duyệt thật | Khóa hiện tại nhận 401 tại mốc thử. Chủ dự án sẽ cập nhật khóa trong `.env`; chưa ghi LLM hoặc AI review thật là đạt khi chưa thử lại với khóa hợp lệ. Fallback và cơ chế giữ chờ duyệt vẫn được kiểm tra. |
| CI GitHub | Workflow có sẵn nhưng chưa có lần run đúng commit mới. Nhóm tự push và lấy link Actions; không tạo lịch sử đóng góp thay người. |
| Hands-on cá nhân | Mỗi thành viên tự điền code, ảnh kết quả và tự nhận xét. Không dùng ảnh chung để thay minh chứng cá nhân. |
| Dịch vụ/vận hành khác | Telegram/SMTP thật, HTTPS/DNS và kiểm thử tải cần kiểm tra riêng nếu chọn nghiệm thu production. Restore local không thay cho backup ngoài máy chủ hoặc mất điện thật. |

SePay Test Mode có dữ liệu/token/webhook tách khỏi Live; không dùng khóa API Live thay cho Test Mode. Xem [Test Mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode) và [xác thực webhook chính thức](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc). Hai cách API Key và HMAC trong source đều được giữ; không bật chế độ bỏ xác thực để làm ảnh demo.

## 5. Xem và chạy lại minh chứng

- JUnit, coverage và dữ liệu HTTP/browser có chọn lọc: `docs/evidence/20261022/`.
- Ảnh được chụp từ trang đang chạy, không vẽ lại giao diện hoặc sửa nội dung ảnh. Bộ đầy đủ nằm ở `Demo/22-10-2026` ngoài source và bản sao có chọn lọc trong evidence.
- Script browser/local, log đầy đủ, bản dump test và hồ sơ đăng nhập demo nằm ở `tmp/complete-20261022` ngoài source; không đóng gói credentials/storage-state/dump đó để triển khai.
- Báo cáo chỉ dùng dữ liệu minh họa và ghi rõ fallback/webhook local. Ảnh và response không thay thế yêu cầu kiểm chứng dịch vụ ngoài.

Các lệnh pytest, frontend và migration trong `docs/QUALITY.md`, `database/HUONG_DAN_MYSQL.md` vẫn áp dụng. Probe đọc cấu trúc: chạy lệnh trong `backend/benchmarks/README.md`. Khi tự chạy MySQL test, phải tạo database test riêng vì fixture tạo/xóa bảng.
