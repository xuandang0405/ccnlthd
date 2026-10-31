# Hoàn thiện và kiểm tra ngày 19/10/2026

Tài liệu giữ kết quả lịch sử ngày 19/10. Phần gửi thông báo ra ngoài đã được gỡ khỏi ứng dụng ngày 24/10; xem [thông báo trên web](WEB_NOTIFICATIONS.md) cho phạm vi đang sử dụng.

## Phạm vi đã sửa

Giữ nguyên FastAPI, MySQL, endpoint, request/response, đăng nhập, phân quyền,
giá gói và frontend. Không thêm thư viện hoặc đổi cấu trúc toàn dự án.

| File | Thay đổi | Test liên quan |
| --- | --- | --- |
| `backend/app/services/retrieval.py` | Xếp hạng SQL trước LIMIT; tìm cả tài liệu cũ chưa có token index; trọng số tập trung ở `term_weight` | `backend/tests/test_public_chat.py`, ba biến thể danh mục 402 đoạn |
| `backend/app/api/public_chat.py` | Bao việc tìm tài liệu và ghi/commit trong khối xử lý lỗi; rollback ghi dở, hoàn lượt đúng nguồn, tránh hoàn lần hai khi lưu fallback lỗi | `backend/tests/test_chat_failure_refunds.py`, mười trường hợp |
| `backend/app/main.py` | Thêm PUT vào CORS; giữ X-Credit-Remaining trong expose_headers và giới hạn origin | `backend/tests/test_cors.py`, hai preflight; test widget hiện có |
| `docs/CODE_MAP_FOR_TEAM.md` | Giải thích từng hàm vừa sửa, cách sửa trọng số và chạy test riêng | Dành cho bốn thành viên đọc và tự chạy |

Trước khi sửa, các test hồi quy đã tái hiện lỗi; sau khi sửa, chúng đạt. Test
retrieval có 401 sản phẩm gần giống trước sản phẩm đúng ở đoạn thứ 402. Kiểm
tra lượt dùng bao gồm lỗi retrieval, lỗi sau khi ghi tin nhắn, lỗi commit,
lỗi lưu fallback và fallback lưu thành công, với cả nguồn FREE và CHATBOT.

## Kết quả đã chạy

Ngày kiểm tra theo giờ Việt Nam: 19/10/2026.

| Kiểm tra | Kết quả và môi trường |
| --- | --- |
| Backend SQLite | 85 đạt, 6 bỏ qua; SQLite trong bộ nhớ |
| Backend MySQL | 91 đạt, 0 bỏ qua; MySQL Community 8.4.11 trong container tạm, backend chạy Windows/Python 3.14.7 |
| Alembic | Upgrade đến `20261010_mysql_initial`; `alembic check` không phát hiện thay đổi model/schema |
| Ruff | Đạt cho app, tests, migrations |
| Python dependencies | `pip check`: không có yêu cầu thư viện bị hỏng |
| Frontend | 14 test đạt; ESLint, hai cấu hình TypeScript và Vite build đạt |
| Coverage MySQL toàn app | Dòng 82,75%; nhánh 57,46%; gộp 78,63% |
| Coverage gate của workflow | Ba module errors/observability/security đạt khoảng 95%, vượt gate 80%; không phải coverage toàn app |

So với bộ 77 test ngày 14/10, có 14 trường hợp tăng thêm: mười hoàn lượt,
hai CORS và hai trường hợp tăng khi tham số hóa retrieval từ một lên ba.
Các số 43/37 ngày 13/10 và 77/71 ngày 14–17/10 là kết quả lịch sử, không bị
thay đổi thành một lần kiểm tra mới. Các tài liệu lịch sử vẫn giữ nguyên ngày.

Database test có tên `ccnlthd_test_20261019`, chạy riêng và không mount volume
dữ liệu dự án. Không dùng database `ccnlthd` thật. Pytest dùng giả lập Gemini,
SePay, Telegram; không chuyển khoản hoặc gửi thông báo thật. Đây không phải
kết quả pytest trong image Python 3.12 hoặc GitHub Actions.

Còn cảnh báo deprecation từ google-genai trên Python 3.14 và annotation zod
trong build frontend. Các cảnh báo không làm test/build thất bại, nhưng cần
được xem lại khi cập nhật phiên bản phát hành.

Minh chứng đi kèm báo cáo tại `baocao/Minh_chung_hoan_thien_20261019` gồm JUnit,
coverage và ghi chú môi trường. Các file này không chứa .env thật. Gói source
chỉ chứa mã và hướng dẫn; không đóng gói database hoặc dữ liệu khách hàng.

## Tự kiểm tra trên máy nhóm

Trong `backend`, cài môi trường của máy mình, không sao chép `.venv` từ máy khác:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m ruff check app tests migrations
.\.venv\Scripts\python.exe -m pytest -q
```

Để chạy MySQL, đặt `TEST_DATABASE_URL` trỏ database test riêng theo
`docs/QUALITY.md`, rồi chạy lại pytest. Fixture tạo/xóa bảng trong database
đó. Không dùng tên `ccnlthd` hoặc bất kỳ database nào chứa dữ liệu cần giữ.
Không sao chép mật khẩu test tạm vào cấu hình triển khai.

Trong `frontend`:

```powershell
npm ci
npm run lint
npm test
npm run build
```

## Còn phải thực hiện trước khi nộp hoặc vận hành

- Bốn thành viên tự hoàn thành phiếu hands-on, chụp code/kết quả của chính
  mình và tự nhận xét. Phiếu trống không phải minh chứng đã làm.
- Ghép đủ source, commit/push bằng tài khoản thật, lấy link GitHub Actions
  đúng commit và lưu artifact. Lần chạy local không thay thế CI thực tế.
- Chạy browser E2E các luồng upload, duyệt, widget, hỗ trợ và thanh toán;
  kiểm tra Gemini/SePay/Telegram/SMTP thật bằng cấu hình được phép sử dụng.
- Diễn tập restore bản dump Docker vào database/volume riêng và đối chiếu
  file với metadata. Việc đã xuất được backup chưa đủ để kết luận restore đạt.
- Đo tốc độ retrieval với file thật lớn. Test 402 đoạn chỉ chứng minh lỗi cắt
  ứng viên đã được khắc phục trong các ca đó, không phải kiểm thử tải.
- Nếu cần bảo đảm lượt dùng qua sự cố tắt máy/DB mất kết nối đúng lúc hoàn,
  bổ sung sổ giữ lượt bền vững và đối soát. `try/except` hiện tại không thể
  bảo đảm khôi phục khi tiến trình đã bị dừng đột ngột.

Các việc trên chưa được ghi là hoàn thành. Không tự tạo lịch sử Git, ảnh
hands-on cá nhân hoặc kết quả dịch vụ ngoài để thay cho kiểm tra thật.
