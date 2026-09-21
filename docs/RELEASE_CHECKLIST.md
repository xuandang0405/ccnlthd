# Release checklist

- [x] Source backend/frontend, migration, worker và Compose đã có.
- [x] Auth, tenant isolation, chatbot, tài liệu, widget, history, lead, quota và payment state machine có automated test local.
- [x] Frontend build/lint và backend test/lint local thành công.
- [ ] Docker Compose build/up/health trên máy chủ thật.
- [ ] PostgreSQL migration trên bản PostgreSQL 16 thật.
- [ ] Redis concurrency/load test.
- [ ] Gemini key/model thật và test grounded answer/usage/cost.
- [ ] SePay API key, ngân hàng, giá Pro, webhook URL và giao dịch sandbox/thật được đối soát.
- [ ] VietQR từ nguồn cấu hình thật.
- [x] Telegram destination challenge, retry hữu hạn và deduplication trong database đã triển khai.
- [ ] Telegram Bot Token/destination thật và delivery thực tế.
- [x] Token reset mật khẩu một lần và thu hồi session có automated test.
- [ ] SMTP provider và email delivery thật.
- [ ] Domain/DNS/IP public hoặc giải pháp CGNAT.
- [ ] HTTPS hợp lệ và kiểm tra từ mạng ngoài.
- [ ] Backup ngoài máy, restore drill và checksum.
- [ ] E2E, security scan, load test và review pháp lý/privacy.
- [ ] Monitoring/alerting, retention và runbook sự cố được chủ hệ thống duyệt.
- [ ] Secret scan sạch, review diff, commit; chỉ push khi chủ dự án xác nhận.

Release production bị chặn cho tới khi toàn bộ mục quan trọng còn trống được xác minh.
