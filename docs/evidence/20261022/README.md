# Minh chứng nghiệm thu local ngày 22/10/2026

Các kết quả dưới đây là kiểm tra local trên dữ liệu test riêng, không phải GitHub Actions hay giao dịch/dịch vụ ngoài thật.

## Kết quả

| Phạm vi | Kết quả |
| --- | --- |
| Backend, MySQL 8.4.11, Python 3.14.7 | 126 đạt; 0 lỗi, 0 bỏ qua; 306,21 giây |
| Backend, SQLite, cùng bộ test | 114 đạt, 12 bỏ qua; 0 lỗi; 18,12 giây |
| Frontend | 26 đạt; TypeScript, lint, build đạt |
| Migration và SQL khởi tạo | `alembic check`: No new upgrade operations detected; 32 bảng tính cả alembic_version |
| HTTP replay qua hai process Uvicorn | Cùng response; số dư 19; hai Message; không gọi lại Gemini |

Không cộng số test MySQL và SQLite thành số ca kiểm thử khác nhau. Coverage MySQL gồm 2.677/3.214 dòng và 385/646 nhánh; chỉ số kết hợp là 79,33%. Đây không phải tỷ lệ chức năng hoàn thiện. Mốc retry đầu ngày có 120 test trước khi thêm sáu test fallback; JUnit/coverage cũ được giữ trong `retry-baseline/`.

## File gốc được lưu

- [tests-mysql.xml](tests-mysql.xml): JUnit của toàn bộ bộ test trên MySQL.
- [tests-sqlite.xml](tests-sqlite.xml): JUnit SQLite, ghi rõ 12 ca bỏ qua.
- [coverage-mysql.xml](coverage-mysql.xml), [coverage-sqlite.xml](coverage-sqlite.xml): độ phủ ứng dụng, không loại mã cũ để tăng phần trăm.
- [http-restart-smoke.json](http-restart-smoke.json): kết quả HTTP thật trước/sau thay process. Gemini được thay bằng fake để không gọi API ngoài; MySQL và HTTP là thật.
- [browser-evidence.json](browser-evidence.json): login/quyền, tài liệu PENDING/APPROVED và hai tenant, ticket; API và worker thật, Gemini trả 401 nên dùng fallback.
- [browser-extended-evidence.json](browser-extended-evidence.json): thu hồi duyệt, worker lỗi/thử lại, ticket ảnh và webhook tự ký local.
- [embed-evidence.json](embed-evidence.json): widget trên trang khác origin.
- [request-traces.json](request-traces.json): 10 request ID đối chiếu access log và log HTTP 401 từ Gemini, không có token.
- [restore-evidence.json](restore-evidence.json): đối chiếu số hàng/hash 32 bảng và hash bốn tệp upload sau restore sang database khác.
- [cleanup.json](cleanup.json): đã dừng server demo và xóa đúng container/volume test riêng sau khi lưu minh chứng; không sửa database nghiệp vụ.
- [report-verification.json](report-verification.json): hash bản báo cáo mới, 220 trang đã kiểm tra, ba mục lục thật và 424 liên kết số trang không sai lệch.
- `browser/`: 26 ảnh từ website đang chạy; không có ảnh dựng lại. Thư mục `mechanisms/` có output probe độc lập, code/lệnh trong `backend/benchmarks/`.

Code kiểm thử nằm tại `backend/tests/test_chat_retry.py`, `backend/tests/test_mysql_chat_retry.py` và `frontend/tests/chat-retry.test.mjs` (tính từ `source`). Script và log HTTP local còn tại `tmp/retry-20261022/` bên ngoài `source`, không đưa vào source triển khai.

## Lệnh kiểm tra

Trong `source/backend`, với dev dependencies đã cài:

```powershell
.\.venv\Scripts\python.exe -m ruff check app tests migrations
# Mặc định SQLite tạm; không dùng database thật.
.\.venv\Scripts\python.exe -m pytest -q --junitxml tests-sqlite.xml --cov=app --cov-branch --cov-report=xml:coverage-sqlite.xml

# Tạo DB test trống riêng và đặt URL cho chính máy chạy test trước.
# Ví dụ tên DB: ccnlthd_test_local. Không đặt TEST_DATABASE_URL trỏ vào ccnlthd.
$env:TEST_DATABASE_URL="mysql+aiomysql://tai_khoan_test:mat_khau_test@127.0.0.1:3306/ccnlthd_test_local?charset=utf8mb4"
.\.venv\Scripts\python.exe -m pytest -q --junitxml tests-mysql.xml --cov=app --cov-branch --cov-report=xml:coverage-mysql.xml
Remove-Item Env:TEST_DATABASE_URL
```

URL mẫu phải được thay bằng tài khoản/database test của máy, không phải thông tin cấu hình thật. Fixture tạo/xóa bảng trong DB test trước/sau từng ca. Test `KILL CONNECTION` yêu cầu tài khoản test được phép đóng kết nối của chính tài khoản đó. Ca này chỉ được chạy trên MySQL test riêng.

Mốc retry ban đầu dùng container `ccnlthd-retry-20261022`. Đợt đầy đủ dùng `ccnlthd-complete-20261022`, cổng localhost 33079; pytest, demo và restore dùng ba database test tách biệt. Không dùng volume/database nghiệp vụ. Container test được dọn sau khi lưu kết quả.

Trong `source/frontend`:

```powershell
npm test
npx tsc -b
npm run lint
npm run build
```

Lần này build frontend ra thư mục tạm riêng để kiểm tra, không thay bản đang được server phục vụ. Cần build lại vào `frontend/dist` khi áp dụng bản sửa theo hướng dẫn nâng cấp.

## Hiểu đúng các ca gây lỗi

- Test fault injection phát sinh lỗi trước COMMIT hoặc sau khi COMMIT thật thành công để mô phỏng mất ACK. Kiểm tra cả giữ lượt, hoàn tất và hoàn lượt, cho nguồn miễn phí và lượt mua.
- Test MySQL đồng thời gửi 12 request cùng mã qua session DB riêng, kiểm tra chỉ một lần gọi fake AI và một lần tính lượt.
- Test SQL thật dùng một kết nối khác gửi `KILL CONNECTION` trước COMMIT giữ lượt hoặc lưu kết quả, rồi gửi lại cùng mã. Không gọi đó là bằng chứng ngắt mạng sau COMMIT.
- Test thời hạn lượt giữ dùng mốc hết hạn có kiểm soát để kiểm tra phục hồi, không chờ tắt máy/mất điện thật.
- HTTP restart thay process sau khi đã hoàn tất tin nhắn, kiểm tra replay từ database. Không đánh đồng với thử nghiệm mất điện trong khi đang ghi đĩa.

Phạm vi triển khai, giới hạn và hướng dẫn nâng cấp: [CHAT_RETRY.md](../../CHAT_RETRY.md).
