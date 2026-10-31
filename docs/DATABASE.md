# Database: SQLAlchemy + MySQL

Backend sử dụng SQLAlchemy ORM với AsyncSession và driver aiomysql; MySQL/MariaDB lưu dữ liệu nghiệp vụ và bộ đếm rate-limit. Không còn truy vấn MongoDB trong API/worker đang chạy.

Cách nhập schema thủ công, cấu hình local và chạy dự án: [database/HUONG_DAN_MYSQL.md](../database/HUONG_DAN_MYSQL.md).

## Các file cần đọc

- `backend/app/models/entities.py`: model ORM, khóa chính, khóa ngoại, unique và index.
- `backend/app/core/database.py`: engine, session, commit/rollback, chuẩn hóa thời gian UTC.
- `backend/app/core/records.py`: thao tác ORM dùng chung; điều kiện SQL nằm ở nơi gọi.
- `backend/migrations/versions/`: lịch sử Alembic đang dùng.
- `database/schema_mysql.sql`: bản SQL khởi tạo để nhập vào database trống.

## Các nhóm bảng

| Nhóm | Bảng |
| --- | --- |
| Tài khoản và doanh nghiệp | users, organizations, organization_members, refresh_sessions, password_reset_tokens |
| Dịch vụ và lượt dùng | plans, subscriptions, organization_credits, organization_limits, usage_logs, quota_logs |
| Chatbot và kiến thức | chatbots, documents, document_chunks, document_chunk_tokens, chatbot_documents |
| Hội thoại và khách hàng | visitor_sessions, conversations, messages, leads |
| Thanh toán | payment_orders, transactions |
| Hỗ trợ | support_tickets, support_ticket_messages, support_ticket_attachments |
| Quản trị và vận hành | audit_logs, system_settings, rate_limit_counters |
| Phiên bản schema | alembic_version |

ID vẫn là UUID dạng chuỗi 36 ký tự để giữ hợp đồng API. Thời gian lưu dưới dạng UTC DATETIME(6), đọc lên thành datetime có múi giờ UTC. Tiếng Việt dùng utf8mb4.

Mỗi query người dùng vẫn phải lọc theo organization_id và xác minh membership. Khóa ngoại không thay thế kiểm tra quyền.

## Giao dịch và cạnh tranh

- Session mỗi request commit trước khi gửi response; gặp lỗi thì rollback.
- Ví lượt dùng được khóa trước chatbot; các bước phân bổ/thu hồi cùng một transaction.
- Commit bước trừ lượt trước khi gọi Gemini để không giữ khóa trong lúc chờ mạng; nếu Gemini lỗi thì hoàn lượt.
- Webhook khóa đơn thanh toán, chỉ chuyển PENDING thành SUCCESS một lần. Unique(provider, provider_transaction_id) chống ghi trùng giao dịch.
- Worker claim job và commit trạng thái trước khi xử lý dài; job PROCESSING quá hạn có thể được nhận lại.
- MySQL dùng READ COMMITTED để kiểm tra giới hạn sau khi chờ khóa đọc được dữ liệu mới nhất.
- Hội thoại/lead giữ chatbot_id lịch sử ngay cả khi chatbot bị xóa. Liên kết tài liệu cascade; usage_logs.chatbot_id chuyển thành NULL khi xóa chatbot.

## Migration và dữ liệu cũ

`backend/alembic.ini` trỏ vào `backend/migrations/`. Đây là thư mục migration dùng cho bản MySQL. Công cụ MongoDB và bộ migration SQL cũ đã được tách khỏi source đang chạy. Có thể tra lại trong lịch sử Git hoặc bản lưu riêng khi cần đối chiếu giai đoạn trước.

Import schema không chuyển dữ liệu MongoDB. Dữ liệu cũ chưa được nhập hoặc xóa. Database mới bắt đầu trống; muốn giữ tài khoản/tài liệu cũ cần bước chuyển dữ liệu được đối chiếu và sao lưu riêng.
