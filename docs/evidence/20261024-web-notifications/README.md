# Kiểm tra thông báo trên web ngày 24 tháng 10 năm 2026

Đây là kết quả local, không phải kết quả GitHub Actions hoặc kiểm thử tải production.

- Backend MySQL 8.4.11 riêng: 141 test đạt, không bỏ qua; chạy trên Windows Python 3.14.7.
- Backend SQLite: 129 đạt, 12 test cần hành vi đồng thời của MySQL được bỏ qua. Không cộng hai bộ thành số test duy nhất.
- Frontend: 28 test đạt, ESLint và TypeScript/Vite build đạt.
- Alembic trên database tạo bằng lịch sử migration: check đạt; giữ các bảng lưu trữ cũ.
- Nhập `database/schema_mysql.sql` vào database test trống: 30 bảng gồm 29 bảng nghiệp vụ và `alembic_version`; Alembic check đạt. Không DROP hoặc nhập đè database đang dùng.
- Trình duyệt Edge: gửi form widget, polling hiện khách mới sau 14.76 giây trong một mẫu quan sát, khởi động lại API vẫn còn dữ liệu, Beta không thấy hoặc sửa được liên hệ Alpha, CONTACTED làm số NEW giảm và bản ghi vẫn còn. Viewport 360px không tràn ngang toàn trang.

Các tài khoản và liên hệ trong ảnh là dữ liệu thử. `browser-evidence.json` chứa request ID; JUnit ghi kết quả từng ca. Không gọi AI, ngân hàng hoặc dịch vụ nhắn tin trong đợt kiểm tra thông báo này.

Bản Docker đang dùng được cập nhật hẹp, giữ revision `20261010_mysql_initial`, không chạy migration. Readiness qua Nginx trả 200, không còn route tích hợp cũ, không còn container gửi tin; tám bảng dữ liệu được đối chiếu hash trước/sau và không thay đổi. Không dùng kết quả này để khẳng định toàn bộ source mới đã được nâng schema trên dữ liệu thật.
