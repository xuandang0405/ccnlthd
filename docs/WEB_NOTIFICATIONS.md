# Thông báo khách hàng mới trên website

Thông báo sử dụng các API đang có, không cần bot, dịch vụ gửi tin, WebSocket hoặc bảng thông báo mới.

## Người dùng thao tác thế nào

- Khách mở chatbot, bấm **Để lại liên hệ** và gửi số điện thoại hoặc email.
- Chủ doanh nghiệp đăng nhập, xem nút **Thông báo** ở header hoặc mục **Thông báo** trong menu.
- Số trên nút là số khách có trạng thái `NEW` (Mới), không phải số thông báo chưa đọc.
- Trang thông báo hiển thị tối đa 5 khách mới nhất: tên, thông tin liên hệ, nhu cầu và thời gian.
- Khi đã thực sự liên hệ khách, bấm **Đánh dấu đã liên hệ**. Sau khi API xác nhận, số khách chờ xử lý giảm.
- Khách vẫn còn trong mục **Khách hàng tiềm năng**; thao tác này không xóa dữ liệu.

## Những file cần tìm

- `backend/app/api/public_chat.py`: lưu liên hệ với trạng thái `NEW` sau khi xác minh phiên khách và chatbot.
- `backend/app/api/dashboard.py`: `/api/v1/dashboard/summary` đếm `new_lead_count` theo doanh nghiệp đăng nhập.
- `backend/app/api/operations.py`: `/api/v1/leads?status=NEW&page=1&page_size=5` và `PATCH /api/v1/leads/{id}`. Cả đọc lẫn cập nhật đều kiểm tra doanh nghiệp, không chỉ ẩn nút trên giao diện.
- `frontend/src/hooks/useCustomerWorkspace.ts`: dùng TanStack Query, cập nhật summary và danh sách mỗi 15 giây; sau khi đổi trạng thái, làm mới cả số đếm và danh sách.
- `frontend/src/components/LeadNotificationLink.tsx`: nút thông báo, trạng thái tải/lỗi.
- `frontend/src/pages/customer/SettingsViews.tsx`: nội dung trang thông báo. URL cũ `/app?view=settings` được giữ để không làm hỏng liên kết đã lưu.

## Giới hạn cần hiểu

Đây là polling khi trang quản lý đang mở, không phải push notification của hệ điều hành. Tab chạy nền có thể tạm dừng polling; quay lại tab sẽ tải lại theo cơ chế mặc định của TanStack Query. Khi tắt web, hệ thống vẫn lưu liên hệ trên MySQL nhưng không gửi cảnh báo ra ngoài. Đăng nhập lại sẽ đọc số liệu đã lưu. Không tự đánh dấu đã liên hệ chỉ vì người dùng mở trang.

Không cần sửa schema để dùng thông báo này. Các migration đã áp dụng và hai bảng tích hợp cũ được giữ để tương thích database cũ, không còn router, ORM model hay worker sử dụng chúng. Alembic bỏ qua bảng lưu trữ này khi so sánh metadata để không tự đề xuất DROP dữ liệu. Không xóa hay viết lại lịch sử migration.

## Chạy dự án

Kết quả và ảnh kiểm tra ngày 24/10 nằm tại `docs/evidence/20261024-web-notifications/README.md`.

Docker chỉ còn 5 service mặc định: MySQL, migrate, backend, worker tài liệu và frontend. Caddy vẫn là lựa chọn HTTPS. `run.bat` và `run-docker.bat` không khởi động worker gửi tin. Giữ cửa sổ chạy mở như trước; không thay `restart: "no"` hoặc thêm tiến trình tự khởi động.

Nếu còn container worker cũ ở trạng thái đã dừng, có thể xóa riêng container đó mà không xóa volume. Không dùng `down -v` hoặc thao tác xóa database.
