# Triển khai trên máy cá nhân

## Máy chủ Windows hiện tại

Domain `seminar.bkpvp.top` dùng Cloudflare Tunnel chạy như Windows service và chuyển HTTPS tới `127.0.0.1:8000`. FastAPI phục vụ cả API lẫn frontend production build; database nghiệp vụ và quota SQLite chỉ bind nội bộ. Không cần mở PostgreSQL/Redis hoặc cài Docker cho cấu hình một máy này.

Trang thanh toán tạo VietQR động bằng Quick Link chính thức với BIN MB Bank, số tiền và nội dung riêng của từng đơn. SePay webhook xác nhận giao dịch và frontend tự cập nhật trạng thái mỗi 5 giây.

Triển khai lại an toàn (tự backup SQLite trước khi build/migration):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\deploy-server.ps1
```

Các tiến trình server ghi PID/log trong `.runtime/`. `deployment/run-server.ps1` khởi động backend và hai worker; `deployment/stop-server.ps1` chỉ dừng tiến trình đã xác minh đúng executable/command line và đặt maintenance marker để supervisor không tự bật lại. Chạy `run-server.ps1` để bỏ marker và khởi động lại. Scheduled task `AI Sales Assistant Server` chạy supervisor sau khi đăng nhập và tự phục hồi tiến trình bị dừng. Scheduled task `AI Sales Assistant Backup` dùng SQLite online backup mỗi ngày, giữ 14 ngày. Cloudflare Tunnel phải tiếp tục ở trạng thái `Running / Automatic`.

Vì tác vụ startup cấp user chỉ chạy sau khi tài khoản Windows đăng nhập, muốn server chạy trước đăng nhập cần mở PowerShell bằng quyền Administrator và đăng ký scheduled task/service tương ứng.

Luồng dự kiến: Internet → router/firewall → Caddy (80/443) → frontend hoặc FastAPI; PostgreSQL/Redis không public.

## Điều kiện bên ngoài cần xác nhận

- Có IP public thực hay nằm sau CGNAT. So sánh WAN IP của router với IP do ISP công bố.
- Domain và bản ghi DNS A/AAAA trỏ đúng IP.
- Port forwarding TCP 80/443 tới IP LAN cố định của máy chủ.
- Windows Firewall chỉ mở 80/443; không mở 5432/6379.
- Nếu CGNAT, dùng tunnel có kiểm soát sau khi đánh giá điều khoản, quyền truy cập và cách bảo vệ origin.

## Lệnh vận hành

```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail 200 backend worker caddy
Invoke-RestMethod https://YOUR_DOMAIN/health/ready
```

Caddy tự xin/gia hạn TLS khi domain công khai hợp lệ và 80/443 tới được máy. `restart: unless-stopped`, health checks và volume bền đã được cấu hình; vẫn cần kiểm thử restart thật.

## Nâng cấp

Backup trước, pull thay đổi đã review, build, rồi chạy `docker compose up -d --build`. Backend chạy migration Alembic trước khi nhận traffic. Với nhiều replica cần tách migration thành một release job duy nhất.
