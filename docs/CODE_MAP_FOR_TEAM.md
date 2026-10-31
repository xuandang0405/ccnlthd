# Hướng dẫn đọc mã nguồn cho nhóm

Tài liệu này là lối vào ngắn nhất để bốn thành viên cùng hiểu dự án. Hãy đọc theo luồng một request thay vì đọc các file theo thứ tự bảng chữ cái.

## 1. Một request đi qua đâu?

```text
Trình duyệt hoặc widget
  → backend/app/main.py (tạo ứng dụng, middleware, gắn router)
  → backend/app/api/*.py (nhận request, kiểm tra quyền, trả response)
  → backend/app/schemas/*.py (Pydantic kiểm tra dữ liệu)
  → backend/app/services/*.py (nghiệp vụ dùng lại hoặc xử lý dài)
  → backend/app/core/database.py + models/entities.py (SQLAlchemy ORM)
  → JSON trả về frontend/src/services/api.ts
```

`Depends(...)` của FastAPI tạo các giá trị cần thiết trước khi chạy endpoint. Ví dụ, `get_tenant_context` trong `api/deps.py` kiểm tra token, người dùng và quyền truy cập doanh nghiệp. `response_model` giới hạn và mô tả dữ liệu trả về. Lỗi nhập liệu sai kiểu thường được FastAPI/Pydantic trả về HTTP 422.

## 2. Nên đọc file nào trước?

| Thứ tự | File | Cần hiểu |
| --- | --- | --- |
| 1 | `backend/app/main.py` | FastAPI, router, middleware, lifespan, health check |
| 2 | `backend/app/schemas/auth.py` | Pydantic model và validation |
| 3 | `backend/app/api/auth.py` | Đăng ký, đăng nhập, refresh token |
| 4 | `backend/app/api/deps.py` | `Depends`, xác thực và phân quyền |
| 5 | `backend/app/core/database.py` và `models/entities.py` | AsyncSession, model, khóa ngoại và giao dịch |
| 6 | `backend/app/api/chatbots.py` | CRUD chatbot trong phạm vi một doanh nghiệp |
| 7 | `backend/app/api/documents.py` và `backend/app/workers/documents.py` | Upload trả 202; worker xử lý file |
| 8 | `backend/app/api/public_chat.py` và `backend/app/services/retrieval.py` | Phiên khách, tìm tài liệu, gọi Gemini, lưu hội thoại |
| 9 | `backend/app/api/payments.py` | Tạo đơn, nhận webhook, cộng lượt |
| 10 | `backend/app/api/admin.py`, `admin_users.py`, `admin_chatbots.py`, `admin_tickets.py` | Các API quản trị được chia theo người dùng, chatbot, ticket; `admin.py` giữ phần tổng quan, tài liệu và thanh toán |

Ở luồng chat, `retrieve_context` chỉ tìm các đoạn trong tài liệu đã được duyệt. SQL xếp hạng ứng viên trước khi giới hạn số lượng; `score_chunk` chấm điểm lại các đoạn đã chọn và `match_found` cho biết có đủ căn cứ để coi sản phẩm là đã tìm thấy. Endpoint `send_message` kiểm tra phiên, giới hạn tần suất, trừ lượt, tìm tài liệu, gọi Gemini rồi lưu hai tin nhắn. Khi Gemini lỗi, hệ thống hoàn lượt và dùng câu trả lời dự phòng. Lỗi tìm tài liệu hoặc ghi hội thoại cũng được rollback và hoàn lượt; không trả thành công cho các lỗi nội bộ này.

## 3. Bốn người có thể học và phụ trách thế nào?

Đây là gợi ý chia theo luồng, không cần chia theo số lượng file bằng nhau:

| Thành viên | Luồng cần nắm | Minh chứng tự làm được |
| --- | --- | --- |
| 1 | FastAPI, Pydantic, auth và `Depends` | Giải thích được 401/403/422 và dependency graph của một endpoint |
| 2 | SQLAlchemy/MySQL, chatbot và tài liệu | Theo dấu một file từ upload đến lúc được duyệt và dùng để trả lời |
| 3 | Widget chat, retrieval và Gemini | Theo dấu một câu hỏi từ widget đến câu trả lời và lượt chat còn lại |
| 4 | Thanh toán, admin, ticket và triển khai | Giải thích webhook chống cộng lượt trùng và quyền admin |

Mỗi thành viên nên tự gọi ít nhất một endpoint bằng `/docs` trong môi trường development, đọc một test liên quan và trình bày lại luồng cho cả nhóm. Frontend chỉ là giao diện gọi API; logic giá, quyền và lượt chat nằm ở backend.

## 4. Khi cần sửa một chức năng

1. Tìm URL trong `docs/API.md`, rồi tìm decorator `@router.get/post/patch/delete` trong `backend/app/api`.
2. Xem request model và response model trong `backend/app/schemas`.
3. Xem các `Depends` để biết ai được gọi API và dữ liệu được lấy từ đâu.
4. Đi theo các hàm service mà endpoint gọi. Chỉ sửa đúng luồng có vấn đề.
5. Xem test trong `backend/tests` và chạy lint/test trước khi đưa lên GitHub.

Ví dụ với lỗi chatbot không đọc được bảng giá: bắt đầu ở `api/public_chat.py:send_message`, sang `services/retrieval.py:retrieve_context`, kiểm tra tài liệu có trạng thái `DONE` và `APPROVED`, rồi mới kiểm tra Gemini. Không cần bắt đầu bằng việc đọc toàn bộ trang admin.

## 5. Kiểm tra sau khi sửa

- Backend: `ruff check app tests` trong thư mục `backend`.
- `pytest` mặc định dùng SQLite tạm, không cần DB ngoài. Test cạnh tranh/khóa cần MySQL riêng qua `TEST_DATABASE_URL`.
- Frontend: `npm run lint`, `npm test`, `npm run build` trong thư mục `frontend`.
- Fixture tạo/xóa bảng test trước/sau mỗi bài. Không dùng `ccnlthd` hay database chứa dữ liệu thật trong `TEST_DATABASE_URL`.
- Mở `/docs` khi `APP_ENV=development` để xem OpenAPI và thử request. `/docs` được tắt trong production.

Luồng chính dùng SQLAlchemy ORM + MySQL. Alembic dùng thư mục `backend/migrations/`. Schema thủ công và cách cấu hình có trong [hướng dẫn MySQL](../database/HUONG_DAN_MYSQL.md). Công cụ database của các phiên bản cũ đã được tách khỏi source đang chạy.

## 6. Frontend tối giản để sử dụng

- `frontend/src/App.tsx` chọn trang theo URL. Trang công khai là `/`, người dùng là `/app`, quản trị là `/admin`.
- `frontend/src/pages/HomePage.tsx` là trang giới thiệu ngắn. `DashboardPage.tsx` và `AdminPage.tsx` vẫn chứa nhiều chức năng cũ, nhưng thanh điều hướng nằm ở đầu trang để người dùng chọn đúng việc cần làm.
- `frontend/src/services/api.ts` là chỗ tập trung gọi backend. Nếu một nút báo lỗi, hãy xem request trong Developer Tools trước khi sửa giao diện.
- CSS chung ở `frontend/src/styles.css`. Giao diện cố ý dùng chữ và nhãn rõ ràng, hạn chế trang trí; không cần học một thư viện thiết kế mới để sửa nội dung cơ bản.

## 7. Các chỗ vừa sửa và cách tự kiểm tra

Không đổi framework, endpoint hoặc chia lại toàn bộ thư mục. Ba thay đổi ngày
19/10/2026 vẫn nằm trong những file vốn phụ trách chức năng đó.

### Tìm sản phẩm trong bảng giá lớn

Mở `backend/app/services/retrieval.py`:

- `important_question_terms`: bỏ từ hỏi thông dụng, giữ tên và mã sản phẩm.
- `term_weight`: mã có chữ số được 5 điểm, từ còn lại 2 điểm. Muốn chỉnh quy tắc
  này chỉ sửa hàm đó; SQL và cách chấm điểm Python dùng cùng một hàm.
- `retrieve_context`: lọc đúng doanh nghiệp, chatbot, tài liệu đã duyệt trước;
  tính điểm trong SQL rồi mới lấy tối đa 400 đoạn có chỉ mục. Tài liệu cũ chưa
  có chỉ mục được tìm riêng, tối đa 300 đoạn theo điểm, không bị bỏ qua khi có
  tài liệu mới. Python chọn tối đa 6 đoạn để đưa cho Gemini.
- Không chỉ tăng LIMIT: cách lấy 400 dòng đầu có thể bỏ mất sản phẩm thật ở
  dòng 402. Test dùng đúng trường hợp này với dữ liệu có, không có và hỗn hợp
  chỉ mục. Đây là test hồi quy, chưa phải đo tốc độ trên một triệu dòng.

Chạy trong `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_public_chat.py -k ranks_exact -q
```

### Trừ và hoàn lượt khi chat

Mở `backend/app/api/public_chat.py`, hàm `send_message`:

1. `consume_credit` trừ lượt và commit sớm để không giữ khóa MySQL trong lúc
   chờ Gemini. Hàm này nằm trong `services/credits.py`.
2. Khối `try` bao trùm tìm tài liệu, gọi Gemini, tạo response, ghi và commit
   hội thoại. Khi Gemini báo lỗi dự kiến, hoàn lượt và lưu câu dự phòng như cũ.
3. `credit_refunded` ghi nhớ đã hoàn hay chưa. Nếu lưu câu dự phòng tiếp tục
   lỗi thì không hoàn thêm lần thứ hai.
4. Khi lỗi nội bộ, rollback các tin nhắn đang ghi dở trước khi hoàn lượt và
   ném lại lỗi. Các ID được giữ trong biến đơn giản để dùng sau rollback.

Test `tests/test_chat_failure_refunds.py` kiểm tra lượt miễn phí và lượt của
chatbot, lỗi retrieval, lỗi sau khi ghi tin nhắn, lỗi commit và lỗi lưu fallback.
Có cả trường hợp Gemini lỗi nhưng fallback lưu thành công.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_chat_failure_refunds.py -q
```

Đây là xử lý lỗi trong tiến trình còn chạy và database còn phục vụ được. Nếu
máy bị tắt đột ngột ngay sau khi trừ lượt hoặc DB không thể nhận lệnh hoàn,
không thể bảo đảm hoàn tự động chỉ bằng `try/except`. Muốn bảo đảm phục hồi
qua sự cố đó cần sổ giữ lượt bền vững và cơ chế đối soát riêng; chưa triển khai.

### CORS không phải phân quyền

Trong `backend/app/main.py`, `allow_methods` có PUT để trình duyệt được phép
gọi API cập nhật chế độ duyệt từ origin hợp lệ. `expose_headers` có
`X-Credit-Remaining` để JavaScript đọc số dư. Danh sách origin vẫn lấy từ cấu
hình; không mở `*`. Quyền admin vẫn do dependency ở backend kiểm tra, không
do CORS quyết định. Test ở `backend/tests/test_cors.py` kiểm tra cả origin
được phép và origin bị từ chối.
