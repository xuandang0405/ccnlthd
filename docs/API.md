# API FastAPI

Prefix: `/api/v1`. Khi `APP_ENV=development` hoặc `test`, mở `/docs` hoặc `/openapi.json` để xem schema request/response sinh từ Pydantic. `/docs` được tắt ở production; `/openapi.json` vẫn có thể truy cập theo cấu hình FastAPI hiện tại.

## Xác thực và quyền

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Các API doanh nghiệp cần `Authorization: Bearer <access_token>` và `X-Organization-ID: <UUID>`. Thiếu/sai token trả 401; thiếu/sai kiểu header tổ chức trả 422; không thuộc doanh nghiệp trả 403.
- Dependency graph của `GET /dashboard/summary`: endpoint → `get_tenant_context` → `get_current_user` → `HTTPBearer` và `get_mongo_db`; endpoint cũng lấy `get_mongo_db` trực tiếp. FastAPI kiểm tra kiểu header UUID và Pydantic kiểm tra body trước khi xử lý nghiệp vụ.
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
| Widget | `POST /public/chat/{public_id}/sessions`, `/messages`, `/leads` | `/messages` cần `X-Visitor-Token`; body có trường `message`. |
| Vận hành | `/conversations`, `/leads`, `/dashboard/summary`, `/tickets` | Lịch sử, lead, số liệu, hỗ trợ. |
| Thanh toán | `GET /public/plans`, `GET /payments/products`, `GET /payments/balance`, `POST /payments/orders/product/{product_code}`, `GET /payments/orders/{id}` | Giá và số lượt do backend quyết định. |
| Webhook | `POST /webhooks/sepay` | Xác thực theo `SEPAY_AUTH_MODE`; xử lý trùng giao dịch. |
| Admin | `/admin/users`, `/admin/chatbots`, `/admin/documents`, `/admin/tickets`, `/admin/audit-logs` | Chỉ super admin, có audit cho thao tác quản trị. |
| Sức khỏe | `/health/live`, `/health/ready` | `ready` kiểm tra MongoDB và bộ đếm/rate limit. |

Endpoint async I/O ví dụ: upload tài liệu gọi `await to_thread.run_sync(...)` để ghi/kiểm tra file mà không chặn event loop, sau đó `await db.documents.insert_one(...)` chờ MongoDB. Việc trích xuất tài liệu dài không dùng FastAPI `BackgroundTasks`; worker riêng tiếp nhận job sau response 202.
