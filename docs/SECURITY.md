# Bảo mật

Đã triển khai: Argon2 password hashing; JWT access token gắn session; refresh rotation/revocation; kiểm tra membership tenant; query tài nguyên theo tenant; CORS allow-list; upload kiểm tra extension, MIME và cấu trúc ZIP/PDF; file UUID ngoài web root; bộ đếm rate-limit trên MySQL ở cấu hình Windows hiện tại; widget token opaque; domain allow-list là tín hiệu bổ sung chứ không phải authentication; system instruction tách khỏi dữ liệu RAG; webhook SePay xác thực theo chế độ cấu hình; chống ghi trùng giao dịch; log truy cập kèm request ID; security headers; secrets qua environment.

`RATE_LIMIT_BACKEND=memory` chỉ dùng cho development. Cấu hình production Windows hiện tại dùng `RATE_LIMIT_BACKEND=sql`; không chạy nhiều worker web với bộ đếm trong bộ nhớ. Nếu chọn Redis, phải triển khai Redis thật và kiểm thử lại giới hạn lượt dùng.

Trước production cần: pentest/DAST, chính sách mật khẩu và lockout phù hợp, rotation secrets, TLS thật, CSP đầy đủ, retention/xóa dữ liệu, malware scanning file, review pháp lý Nghị định 13/2023/NĐ-CP và nghĩa vụ hiện hành, kiểm tra nhà cung cấp AI, kiểm thử phục hồi và giám sát cảnh báo.

Không dựa vào CORS, Origin, public chatbot ID hoặc prompt để phân quyền. Nếu secret từng bị commit, phải thu hồi secret trước; xóa lịch sử Git không thay thế việc thu hồi.

Tệp `.env` được Git bỏ qua và `.env.example` chỉ chứa placeholder. API key, mật khẩu database hay khóa thanh toán từng chia sẻ qua chat/log hoặc lưu ở nơi không kiểm soát nên được thay mới và cập nhật trên máy chủ; không sao chép giá trị thật vào tài liệu hoặc test. Trước phát hành, kiểm tra quyền user/admin, thử upload file sai định dạng, kiểm tra webhook sai xác thực và rà soát dữ liệu nhạy cảm trong log.
