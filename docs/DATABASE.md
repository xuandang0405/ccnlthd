# Database

PostgreSQL là database production. Mọi bảng nghiệp vụ chứa `organization_id` hoặc có quan hệ sở hữu tương đương; API không tin tenant do frontend gửi nếu membership không hợp lệ.

```mermaid
erDiagram
  USERS ||--o{ ORGANIZATION_MEMBERS : joins
  ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
  ORGANIZATIONS ||--o{ CHATBOTS : owns
  ORGANIZATIONS ||--o{ DOCUMENTS : owns
  CHATBOTS }o--o{ DOCUMENTS : uses
  CHATBOTS ||--o{ VISITOR_SESSIONS : serves
  VISITOR_SESSIONS ||--o{ CONVERSATIONS : starts
  CONVERSATIONS ||--o{ MESSAGES : contains
  CONVERSATIONS ||--o{ LEADS : produces
  ORGANIZATIONS ||--o{ SUBSCRIPTIONS : has
  PLANS ||--o{ SUBSCRIPTIONS : defines
  ORGANIZATIONS ||--o{ PAYMENT_ORDERS : creates
  PAYMENT_ORDERS ||--o{ TRANSACTIONS : reconciles
```

Schema còn có `document_chunks`, `usage_logs`, `quota_logs`, `notification_logs` và `audit_logs`. `(provider, provider_transaction_id)` là unique constraint chống replay thanh toán; `(source_message_id)` chống tạo lead trùng từ một message.

Migration hiện tại nằm tại `backend/alembic/versions`. Không dùng `create_all` ở runtime production.
