# Bảo mật

Đã triển khai: Argon2 password hashing; JWT access token gắn session; refresh rotation/revocation; kiểm tra membership tenant; query tài nguyên luôn kèm tenant; CORS allow-list; upload kiểm tra extension, MIME và cấu trúc ZIP/PDF; file UUID ngoài web root; quota Redis nguyên tử fail-closed; widget token opaque; domain allow-list là tín hiệu bổ sung chứ không phải authentication; system instruction tách khỏi dữ liệu RAG; webhook SePay API Key constant-time; unique transaction constraint; log payload thanh toán đã rút gọn; security headers; secrets qua environment.

Trước production cần: pentest/DAST, chính sách mật khẩu và lockout phù hợp, rotation secrets, TLS thật, CSP đầy đủ, retention/xóa dữ liệu, malware scanning file, review pháp lý Nghị định 13/2023/NĐ-CP và nghĩa vụ hiện hành, kiểm tra nhà cung cấp AI, kiểm thử phục hồi và giám sát cảnh báo.

Không dựa vào CORS, Origin, public chatbot ID hoặc prompt để phân quyền. Nếu secret từng bị commit, phải thu hồi secret trước; xóa lịch sử Git không thay thế việc thu hồi.
