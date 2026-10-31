# API FastAPI

Prefix: `/api/v1`. Khi `APP_ENV=development` hoặc `test`, mở `/docs` hoặc `/openapi.json` để xem schema request/response sinh từ Pydantic. `/docs` được tắt ở production; `/openapi.json` vẫn có thể truy cập theo cấu hình FastAPI hiện tại.

## Xác thực và quyền

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Các API doanh nghiệp cần `Authorization: Bearer <access_token>` và `X-Organization-ID: <UUID>`. Thiếu/sai token trả 401; thiếu/sai kiểu header tổ chức trả 422; không thuộc doanh nghiệp trả 403.
- Dependency graph của `GET /dashboard/summary`: endpoint → `get_tenant_context` → `get_current_user` → `HTTPBearer` và `get_db`; endpoint và `get_tenant_context` cũng lấy `get_db` trực tiếp. `get_db` tạo SQLAlchemy `AsyncSession`, dùng `scope="function"` và được FastAPI tái sử dụng trong cùng request. FastAPI kiểm tra kiểu header UUID trước khi xử lý nghiệp vụ. Xem `docs/diagrams/dashboard-dependencies.mmd`.
- Webhook lấy cấu hình bằng `Depends(get_settings)`, cho phép override trong test mà không sửa biến cấu hình toàn cục. `get_settings` vẫn có `lru_cache`; không nạp lại `.env` cho mỗi request. Xem `docs/diagrams/webhook-dependencies.mmd`.
- `/admin/*` chỉ dành cho `is_super_admin`; widget công khai dùng visitor token riêng, không dùng JWT doanh nghiệp.

Ví dụ request login:

```json
{"email":"user@example.com","password":"mật-khẩu-của-bạn"}
```

Email sai định dạng hoặc thiếu trường sẽ có HTTP 422 và `detail` chứa vị trí/lý do lỗi. Mỗi response có header `X-Request-ID` để tra log.

## Các nhóm endpoint

| Nhóm | Endpoint chính | Ghi chú |
| --- | --- | --- |
| Chatbot | `GET/POST /chatbots`, `PATCH/DELETE /chatbots/{id}`, `PUT /chatbots/{id}/documents/{document_id}` | Theo tenant; chỉ gắn tài liệu được duyệt. |
| Tài liệu | `GET/POST /documents`, `GET /documents/{id}/preview`, `POST /documents/{id}/retry`, `DELETE /documents/{id}` | Upload trả 202; worker xử lý nền. |
| Widget | `POST /public/chat/{public_id}/sessions`, `/messages`, `/leads` | `/messages` cần `X-Visitor-Token`; body có `message` và UUID `client_message_id` để retry an toàn. |
| Vận hành | `/conversations`, `/leads`, `/dashboard/summary`, `/tickets` | Lịch sử, lead, số liệu, hỗ trợ. |
| Thanh toán | `GET /public/plans`, `GET /payments/products`, `GET /payments/balance`, `POST /payments/orders/product/{product_code}`, `GET /payments/orders/{id}` | Giá và số lượt do backend quyết định. |
| Webhook | `POST /webhooks/sepay` | Xác thực theo `SEPAY_AUTH_MODE`; xử lý trùng giao dịch. |
| Admin | `/admin/users`, `/admin/chatbots`, `/admin/documents`, `/admin/tickets`, `/admin/audit-logs` | Chỉ super admin, có audit cho thao tác quản trị. |
| Sức khỏe | `/health/live`, `/health/ready` | `ready` kiểm tra MySQL/revision schema và bộ đếm/rate limit. |

Endpoint async I/O ví dụ: upload tài liệu gọi `await to_thread.run_sync(...)` để ghi/kiểm tra file mà không chặn event loop, sau đó `await db.flush()` chờ SQLAlchemy ghi dữ liệu MySQL. Việc trích xuất tài liệu dài không dùng FastAPI `BackgroundTasks`; worker riêng tiếp nhận job sau response 202.

Chat từ 22/10/2026: gửi lại cùng `client_message_id` trong cùng hội thoại để lấy kết quả đã lưu, không trừ thêm lượt. Đang xử lý trả 409 kèm `Retry-After`; xung đột nội dung trả 409 không có header này. Lỗi SQL chưa đối soát được trả 503 kèm `Retry-After`. Client cũ thiếu mã vẫn hoạt động nhưng không chống trùng giữa các request. Xem [hợp đồng và ví dụ retry](CHAT_RETRY.md).

## Endpoint đồng bộ và xử lý mật khẩu

`frontend_index` và `frontend_spa` trong `backend/app/main.py` dùng `def`: chúng
kiểm tra đường dẫn và file trên đĩa bằng `Path.is_file/resolve` đồng bộ khi chạy
web trực tiếp qua FastAPI. FastAPI chạy phần endpoint trong thread pool;
`FileResponse` tiếp tục phục vụ file. Các route SPA này không hiển thị trên Swagger.
Khi chạy Docker, Nginx phục vụ frontend; không coi đó là cùng một luồng phục vụ file.

API dùng SQLAlchemy async vẫn giữ `async def`. Không chuyển cả endpoint đăng nhập
thành `def` vì nó còn cần `await` truy vấn database. `hash_password_async` và
`verify_password_async` chuyển riêng thao tác Argon2 đồng bộ sang AnyIO thread pool.
Đăng ký, đăng nhập, reset mật khẩu và admin reset đều dùng các hàm này.

## Hợp đồng lỗi tương thích frontend

Lỗi do `HTTPException`, `RequestValidationError` hoặc exception ngoài dự kiến có
các trường `detail`, `message`, `error_code`, `status_code`, `request_id`.
Giữ nguyên mã HTTP; giữ `detail` dạng chuỗi hoặc danh sách `loc/msg/type` để
frontend cũ không bị gãy. Header `Retry-After` và những header của exception được giữ.
Lỗi validation không trả `input/ctx`, tránh lộ mật khẩu và lỗi tuần tự hóa object.
Lỗi nội bộ trả thông báo chung, không trả exception hoặc stack trace.

```json
{"detail":"Chưa đăng nhập","message":"Chưa đăng nhập","error_code":"HTTP_401","status_code":401,"request_id":"acceptance-demo"}
```

Swagger mô tả schema `ErrorResponse`. Readiness 503 vẫn trả hợp đồng
`status/components` riêng để công cụ giám sát đọc được. Lỗi của proxy bên ngoài
không nằm trong exception handler FastAPI.

Log `app.access` là JSON gồm timestamp UTC, request ID, method, path, status và
duration_ms. Request ID đầu vào bị giới hạn ký tự và độ dài; ID không hợp lệ
được thay bằng UUID. Không ghi body, query string, mật khẩu hay token vào access log.
