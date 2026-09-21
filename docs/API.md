# API

Prefix: `/api/v1`. OpenAPI `/docs` chỉ bật ngoài production.

- `/auth/register|login|refresh|logout|me`: access token ngắn hạn và refresh session có thu hồi/rotation.
- `/auth/password-reset/request|confirm`: token một lần 30 phút; chỉ gửi khi SMTP thật được bật.
- `/chatbots`: CRUD tenant; `PUT /{id}/documents/{document_id}` gán nguồn tri thức.
- `/documents`: upload/list/preview/retry/delete. Worker xử lý file ở tiến trình riêng.
- `/public/chat/{public_id}/sessions|messages|leads`: API widget bằng visitor token, không dùng JWT doanh nghiệp.
- `/conversations`, `/conversations/{id}`: phân trang và chi tiết lịch sử tenant.
- `/leads`, `PATCH /leads/{id}`: tìm/lọc và cập nhật pipeline.
- `/dashboard/summary`: số liệu thật theo tenant.
- `/payments/orders/pro`: owner tạo đơn từ giá backend.
- `/webhooks/sepay`: webhook công khai nhưng bắt buộc `Authorization: Apikey ...` khi `SEPAY_AUTH_MODE=API_KEY`.
- `/telegram/status|challenge|confirm`: owner xác minh quyền nhận mã trước khi bật thông báo lead.
- `/admin/*`: chỉ `is_super_admin`, thay đổi trạng thái có audit log.
- `/health/live`, `/health/ready`: tiến trình và dependencies.

API doanh nghiệp cần `Authorization: Bearer <access>` và `X-Organization-ID`. Widget cần `X-Visitor-Token`.
