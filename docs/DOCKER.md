# Chạy Trợ Lý Việt bằng Docker

Source hiện ở `D:/QUAN TRỌNG/CCNLTHD/source`. Chế độ Docker không yêu cầu cài Python, Node.js, MySQL hay Redis trên máy chạy; Docker tự build và cài thư viện trong container.

## 1. Cách chạy nhanh trên Windows

- Mở Docker Desktop, đợi Engine chạy, dùng **Linux containers**.
- Nhấp đúp `source/run-docker.bat`.
- Lần đầu tải image và build nên có thể chờ vài phút. Các URL được in trong cửa sổ; sử dụng khi backend/frontend đã healthy.
- Mở `http://127.0.0.1:8080/`, đăng ký tài khoản mới để test.
- Giữ cửa sổ mở để xem log. Nhấn **Ctrl+C** để dừng. Nếu đóng cửa sổ cưỡng bức và container vẫn còn chạy, bấm `stop-docker.bat`.

Không dùng `-d` trong file chạy, và các container đặt `restart: "no"` để không tự bật lại khi Docker/máy tính khởi động. Đây là lựa chọn chạy thủ công theo cách nhóm đang dùng, không phải cơ chế tự phục hồi production.

`run.bat` cũ vẫn chạy môi trường không Docker ở cổng 8000. Không cần sửa/xóa môi trường ấy. Docker dùng cổng 8080 nên có thể tồn tại độc lập.

## 2. Thành phần và thứ tự khởi động

| Thành phần | Công việc |
| --- | --- |
| mysql | MySQL 8.4, dữ liệu riêng trong volume mysql_data |
| migrate | Chạy Alembic upgrade head, kết thúc thành công trước API/worker |
| backend | FastAPI trên mạng nội bộ Docker, không mở cổng 8000 ra máy host |
| worker | Nhận và xử lý tài liệu nền |
| notification-worker | Xử lý thông báo Telegram |
| frontend | Build React/Vite; Nginx phục vụ giao diện và proxy API |
| caddy (tùy chọn) | HTTPS trực tiếp, chỉ chạy khi bật profile https |

Không thêm Redis vì bản hiện tại dùng rate-limit trên SQL. MySQL không mở cổng 3306 ra máy host/Internet. Frontend là điểm truy cập duy nhất ở `127.0.0.1:8080`.

MySQL phải healthy trước khi chạy migration. Migration exit code 0 là bình thường, không phải lỗi. Chỉ sau migration thành công, backend và hai worker mới chạy; frontend đợi backend healthy. Xem [tài liệu Docker về thứ tự khởi động](https://docs.docker.com/compose/how-tos/startup-order/).

## 3. Cấu hình và dữ liệu

Lần đầu, `deployment/setup-docker.ps1` tạo `source/.env.docker`:

- Giữ các khóa Gemini/SePay/Telegram/email trong backend/.env nếu có, không in giá trị ra log.
- Sinh mật khẩu MySQL và APP_SECRET_KEY riêng.
- Đặt URL local cổng 8080 và kết nối database nội bộ qua hostname `mysql`.
- Không sửa backend/.env; không lấy mật khẩu root local hoặc kết nối MongoDB cũ.
- Nếu .env.docker đã tồn tại, giữ nguyên để lần sau dùng đúng mật khẩu và secret.

`.env.docker` được Git bỏ qua; `.env.docker.example` chỉ có mẫu. Dockerfile không COPY .env hoặc thư mục upload vào image. Không chia sẻ output `docker compose config` hoặc `docker inspect` vì có thể chứa secret; dùng `config --quiet` để kiểm tra.

`mysql_data` và `uploads` là named volumes. Dừng hoặc xóa container thông thường không xóa chúng. **Không chạy `docker compose down -v`, volume prune hoặc system prune --volumes** khi chưa có backup và chủ dự án chưa đồng ý.

Giữ nguyên COMPOSE_PROJECT_NAME khi chạy lại: tên project quyết định tên volume. Đổi tên project sẽ tạo bộ dữ liệu Docker khác, không tự lấy dữ liệu của project trước.

Database Docker bắt đầu riêng, chưa có tài khoản/tài liệu local. Không tự chuyển dữ liệu từ MySQL XAMPP hoặc MongoDB. Muốn chuyển dữ liệu cần backup và quy trình import riêng; không trỏ fixture test vào database thật.

MySQL chỉ đọc biến tạo user/password khi volume khởi tạo lần đầu. Đổi MYSQL_PASSWORD trong .env.docker không tự đổi mật khẩu đã lưu trong MySQL; phải đổi mật khẩu trong DB tương ứng hoặc khôi phục cấu hình cũ, không xóa volume để chữa lỗi.

Sau khi đổi khóa tích hợp, dừng rồi mở run-docker.bat để Compose cập nhật environment. Sau khi sửa source, lần chạy sẽ build lại phần thay đổi. Khi có migration mới trên dữ liệu thật, đọc migration và backup trước khi khởi động bản mới.

## 4. Các trang

- Trang chủ: http://127.0.0.1:8080/
- Đăng ký/đăng nhập: /register, /login
- Khách hàng: /app
- Quản trị: /admin
- Swagger: /docs (APP_ENV=development); /health/ready để kiểm tra
- Script nhúng: /widget.js
- Chatbot: /widget/ID_CÔNG_KHAI
- Trang test: /widget-test.html?chatbotId=ID_CÔNG_KHAI

ID công khai lấy từ mã nhúng của chatbot vừa tạo, không dùng ID tài khoản/doanh nghiệp hoặc ID chatbot cũ ở database khác. Trang test dùng cùng website đang mở, không còn gọi domain demo cũ.

## 5. Cấp admin

Đăng ký tài khoản trước. Trong PowerShell mở tại source, khi Docker đang chạy:

```powershell
docker compose --env-file .env.docker exec backend python -m app.cli promote-admin email-cua-ban@example.com
```

Đăng nhập lại rồi mở /admin. Không có mật khẩu quản trị mặc định.

## 6. Các lệnh thường dùng

Chạy trong source:

```powershell
# Nếu chưa có cấu hình:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deployment\setup-docker.ps1

# Kiểm tra, không in secret:
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker ps -a

# Log:
docker compose --env-file .env.docker logs --tail 100 backend worker notification-worker

# Chạy foreground:
docker compose --env-file .env.docker up --build --abort-on-container-failure

# Dừng, giữ database và upload:
docker compose --env-file .env.docker stop

# Đối chiếu schema:
docker compose --env-file .env.docker exec backend python -m alembic check
```

[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) giải thích chế độ log foreground và việc dừng khi Ctrl+C. File chạy không xóa image, volume hoặc container của dự án khác.

## 7. Dùng domain/server

Nếu dùng Cloudflare Tunnel trên host, trỏ hostname tới `http://127.0.0.1:8080`. Trong .env.docker đổi APP_PUBLIC_URL và FRONTEND_ORIGIN thành domain HTTPS, APP_DOMAIN chỉ chứa hostname. Đặt APP_ENV=production để tắt /docs và các cấu hình bảo mật production. Sau đó dừng/chạy lại. Docker không tự sửa DNS/Tunnel/webhook SePay.

HTTPS trực tiếp bằng Caddy là tùy chọn sẵn có: `docker compose --env-file .env.docker --profile https up --build --abort-on-container-failure`. Cần domain đúng, DNS và port 80/443 đi tới máy này; tránh xung đột web server khác. Cách này cần kiểm chứng trên môi trường public riêng.

## 8. Backup và giới hạn

Có thể chạy `deployment/backup-docker.ps1` để xuất MySQL và file upload ra host. Xem cách gọi trong phần backup Docker của `docs/BACKUP_RESTORE.md`; cất một bản ngoài máy chủ.

`deployment/backup.ps1` và `restore.ps1` là script PostgreSQL lịch sử, **không dùng cho Docker MySQL hiện tại**. `backup-server.ps1` chỉ dành môi trường không Docker; không dùng nó để backup database trong container.

Build/chạy local không chứng minh Gemini, chuyển tiền SePay, Telegram, email hoặc domain public hoạt động thật. Các tích hợp ấy cần cấu hình và test riêng. Giữ API/request/response và nghiệp vụ hiện có; Docker chỉ thay cách đóng gói/vận hành.
