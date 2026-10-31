# Retry tin nhắn và đối soát lượt chat

Ngày cập nhật: 22/10/2026. Phạm vi: API chat công khai, widget và khung thử chatbot. Không thay giá, quyền tài khoản, nghiệp vụ thanh toán hay cấu hình Gemini.

## 1. Bài toán được xử lý

Trình duyệt có thể mất phản hồi dù server đã lưu câu trả lời. Nếu gửi lại như một câu hỏi mới, hệ thống cũ sẽ gọi AI và trừ thêm lượt. Ngược lại, nếu SQL báo lỗi lúc COMMIT, không thể kết luận ngay rằng giao dịch chưa được lưu để hoàn lượt tùy ý.

Giải pháp sử dụng một mã cho một tin nhắn và lưu trạng thái trong MySQL. Số dư và trạng thái yêu cầu được thay đổi cùng transaction. Không dùng biến trong bộ nhớ server để quyết định đã trừ/hoàn lượt hay chưa.

## 2. Cách gửi API

Endpoint, visitor token và response giữ nguyên. Request được bổ sung trường UUID:

```json
{
  "message": "Sản phẩm này giá bao nhiêu?",
  "client_message_id": "6ba7b810-9dad-4d80-8c8e-123456789abc"
}
```

- Frontend tạo mã một lần trước khi gửi. Các lần thử lại phải dùng cùng mã, nội dung và `X-Visitor-Token`.
- Cùng mã và cùng hội thoại: nhận kết quả đã lưu hoặc trạng thái đang xử lý, không tạo thêm lần tính phí thành công.
- Cùng mã nhưng nội dung khác: HTTP 409, không gọi AI hoặc trừ thêm lượt.
- Câu hỏi mới, kể cả trùng chữ với câu đã trả lời thành công: tạo mã mới.
- Mã được giới hạn theo hội thoại và luôn kiểm tra tenant/phiên truy cập trước khi đọc kết quả. Biết mã không thay thế quyền truy cập.
- Client cũ không gửi trường này vẫn dùng được API: server tự tạo UUID. Tuy nhiên, client đó không có bảo đảm chống trùng giữa hai request riêng biệt. Cần cập nhật widget/frontend để có retry an toàn.

## 3. Ba trạng thái dễ đọc trong database

| Trạng thái | Ý nghĩa | Xử lý khi gửi lại |
| --- | --- | --- |
| `PROCESSING` | Đã giữ một lượt, đang xử lý | Còn thời hạn: 409 kèm `Retry-After: 2`; hết thời hạn: tiếp tục lượt đã giữ |
| `COMPLETED` | Đã lưu câu hỏi, câu trả lời và kết quả | Trả lại response đã lưu, không gọi AI, không trừ/hoàn thêm |
| `RETRYABLE` | Lần trước lỗi, lượt đã được hoàn | Có thể xử lý lại và giữ một lượt mới |

Một lượt xử lý có thời hạn 180 giây (`LEASE_SECONDS`). Đây là thời hạn quyền xử lý của server, không phải thời hạn phiên đăng nhập. Mỗi lần xử lý có `attempt_token` riêng; tiến trình cũ không được ghi kết quả/hoàn lượt nếu quyền đã được lấy lại bởi lần xử lý khác.

Khi doanh nghiệp gửi một tin nhắn khác, hệ thống thu hồi tối đa 30 lượt giữ bị bỏ dở quá hạn trong doanh nghiệp đó. Nếu gửi lại chính tin nhắn bị bỏ dở, tiếp tục lượt đã giữ thay vì hoàn rồi trừ lại. Không có worker chạy nền để quét bảng này: nếu không có request mới, lượt giữ vẫn nằm ở trạng thái chờ đến khi có hoạt động tiếp theo. Khi server không truy cập được SQL, không đoán số dư hoặc hoàn lượt bằng bộ nhớ.

## 4. Ranh giới transaction và mất kết nối

1. Xác minh phiên, kiểm tra kết quả cũ, kiểm tra rate limit đối với lần xử lý chưa hoàn tất.
2. Khóa ví rồi yêu cầu chat; lưu `PROCESSING` và trừ lượt cùng một transaction ngắn. Thứ tự khóa ví trước được giữ giống luồng phân bổ/thu hồi lượt hiện tại.
3. Lấy ngữ cảnh và gọi Gemini, không giữ khóa ghi số dư trong thời gian chờ AI.
4. Khóa ví/yêu cầu lần nữa và kiểm tra `attempt_token`. Lưu một cặp hỏi–đáp và `COMPLETED` cùng transaction. Nếu Gemini lỗi, câu trả lời dự phòng và hoàn lượt cũng được lưu cùng transaction này, giữ nghiệp vụ fallback hiện tại.
5. Nếu có lỗi khi lưu, rollback rồi đọc lại trạng thái trên kết nối mới. Đã `COMPLETED` thì trả kết quả cũ, không hoàn. Chưa hoàn tất và vẫn đúng chủ xử lý thì hoàn lượt và chuyển `RETRYABLE` cùng transaction.

Chỉ thử lại thao tác giữ/đối soát tối đa hai lần với lỗi SQL tạm thời như mất kết nối, timeout pool, lock timeout hoặc deadlock. Nếu không đối soát được, API trả 503 kèm `Retry-After: 2`, giữ thông tin trong DB để phục hồi sau. Không chạy lại tùy tiện một câu lệnh trừ/hoàn tiền.

`pool_pre_ping` chỉ kiểm tra kết nối lúc lấy từ pool, không cứu transaction đang bị đứt giữa chừng. Tham khảo [SQLAlchemy: retry tại ranh giới transaction](https://docs.sqlalchemy.org/en/20/faq/connections.html#how-do-i-retry-a-statement-execution-automatically) và [xử lý mất kết nối](https://docs.sqlalchemy.org/en/20/core/pooling.html#disconnect-handling-pessimistic).

## 5. Các file cần đọc hoặc sửa

Đường dẫn dưới đây tính từ thư mục `source`:

- `backend/app/schemas/public_chat.py`: kiểm tra kiểu UUID của mã tin nhắn.
- `backend/app/models/entities.py`: model `ChatRequest`.
- `backend/app/services/chat_requests.py`: nhận quyền xử lý, đọc kết quả, đối soát/hoàn lượt. Đọc lần lượt `completed_response`, `claim_request`, `lock_attempt`, `release_failed_request`.
- `backend/app/services/credits.py`: `commit=False` để gộp thay đổi số dư vào transaction của yêu cầu; mặc định vẫn commit như các luồng cũ.
- `backend/app/api/public_chat.py`: nối các bước vào `send_message`.
- `backend/migrations/versions/20261022_chat_retry.py`: migration chỉ thêm bảng mới và index.
- `frontend/src/services/chatRetry.ts`: giữ mã, giới hạn số lần thử và thời gian chờ.
- `frontend/src/hooks/useWidgetChat.ts`, `frontend/src/hooks/useChatbotPreview.ts`: sử dụng helper, giữ lại nội dung/mã nếu gửi lỗi.
- `backend/tests/test_chat_retry.py`: test hành vi, fault injection trước/sau COMMIT và phục hồi lượt giữ.
- `backend/tests/test_mysql_chat_retry.py`: request đồng thời bằng session SQL riêng và `KILL CONNECTION` trên MySQL test thật.
- `frontend/tests/chat-retry.test.mjs`: kiểm tra ID, số lần gửi và các mã lỗi được phép retry.

## 6. Nâng cấp database có dữ liệu

Đợt triển khai này không chạy migration trên database thật. Người vận hành cần thực hiện:

1. Dừng server/worker và sao lưu database cùng dữ liệu upload.
2. Kiểm tra `DATABASE_URL` trong `backend/.env` trỏ đúng database cần nâng cấp.
3. Trong `source/backend`, chạy:

```powershell
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic check
```

4. Revision cần là `20261022_chat_retry (head)`. Trong frontend chạy `npm run build`, sau đó mở lại `run.bat`. Nếu dùng Docker, rebuild và khởi động bằng quy trình trong `docs/DOCKER.md`; dịch vụ migration chạy trước backend.

Không import lại `database/schema_mysql.sql` vào database cũ. SQL đó chỉ để khởi tạo database trống, đã bao gồm bảng mới. Không sửa tay `alembic_version` để bỏ qua migration.

## 7. Giới hạn cần nói đúng khi bảo vệ

- Bảo đảm trọng tâm là một lần ghi nhận số dư/kết quả thành công cho cùng mã và hội thoại, không phải gọi nhà cung cấp AI đúng một lần trong mọi sự cố. Nếu tiến trình chết sau khi gọi AI nhưng chưa lưu kết quả, lần phục hồi có thể phải gọi AI lại.
- Response trả lại là bản đã lưu, gồm số dư tại lần hoàn tất ban đầu; không phải truy vấn số dư mới nhất nếu đã có tin nhắn khác sau đó.
- Hai mã khác nhau vẫn là hai câu hỏi. Frontend đang giữ một tin nhắn chờ trong bộ nhớ trang, không phục hồi mã/phiên sau tải lại hoặc đóng trang.
- Xóa hội thoại/doanh nghiệp sẽ xóa bản ghi retry liên quan theo khóa ngoại. Không dựa vào mã của một hội thoại đã xóa để phục hồi.
- Test Gemini dùng giả lập có kiểm soát, không chứng minh Gemini thật luôn sẵn sàng. Fault injection sau COMMIT mô phỏng mất ACK; không được gọi đó là ngắt mạng thật sau COMMIT. Test `KILL CONNECTION` là ngắt kết nối SQL thật trước COMMIT trên MySQL riêng.
- Không coi retry này là đã nghiệm thu SePay sandbox, mất điện toàn máy hoặc mọi tình huống mạng production.

## 8. Kết quả kiểm tra ngày 22/10/2026

- Mốc kiểm tra retry đầu ngày: MySQL 8.4.11 có 120 test đạt; SQLite có 108 đạt và 12 bỏ qua. Output mốc này được giữ riêng trong `evidence/20261022/retry-baseline/`.
- Bộ kiểm tra cuối ngày sau khi thêm 6 test fallback: MySQL 8.4.11 trong container test riêng có 126 test đạt, không bỏ qua/thất bại. Trong đó có 23 test hành vi retry/fault injection và 6 test MySQL retry đồng thời/ngắt kết nối thật. Các test cũ vẫn chạy cùng bộ này.
- SQLite cuối ngày: 114 đạt, 12 bỏ qua vì cần MySQL. Đây là cùng bộ test chạy trên database khác, không cộng thành 240 chức năng đã kiểm tra.
- Frontend: 26 test đạt; TypeScript `tsc -b`, ESLint và Vite build đạt. Build còn cảnh báo annotation từ dependency Zod, không phải lỗi build.
- HTTP thật qua Uvicorn và MySQL riêng: gửi một tin nhắn, dừng process server, chạy process mới rồi gửi lại cùng mã/visitor token. Kết quả không đổi, số dư giữ 19/20, chỉ có hai Message. Process mới được cấu hình để báo lỗi nếu gọi Gemini, nhưng replay vẫn thành công. Cả hai server tạm đã dừng sau kiểm tra.
- Alembic: nâng từ revision cũ lên head, kiểm tra model/schema, downgrade/upgrade lại chỉ trên DB bỏ đi; bản ghi doanh nghiệp mẫu cũ vẫn còn. Bản SQL khởi tạo thủ công cũng qua `alembic check`. Mốc 22/10 có 31 bảng nghiệp vụ và `alembic_version`; bản SQL nhập mới ngày 24/10 còn 29 bảng nghiệp vụ sau khi gỡ tích hợp gửi tin. Lịch sử migration và dữ liệu cũ được giữ.
- Ruff và kiểm tra định dạng các file Python mới/sửa đạt. Một cảnh báo deprecation từ `google-genai` trên Python 3.14 còn tồn tại; không đổi dependency trong đợt sửa này.

JUnit, coverage và kết quả HTTP được lưu tại [minh chứng 22/10](evidence/20261022/README.md). Coverage là độ phủ mã, không phải phần trăm hoàn thiện sản phẩm. Báo cáo Word có bản cập nhật riêng ngày 22/10; các ZIP source cũ chưa được đóng gói lại. Chưa push GitHub và chưa có lần CI mới. Xem [biên bản nghiệm thu local và phần còn thiếu](ACCEPTANCE_20261022.md).
