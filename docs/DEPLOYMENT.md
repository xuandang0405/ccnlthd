# Triển khai trên máy cá nhân

## Máy chủ Windows hiện tại

Domain `seminar.bkpvp.top` dùng Cloudflare Tunnel chạy như Windows service và chuyển HTTPS tới `127.0.0.1:8000`. FastAPI phục vụ cả API lẫn frontend production build; dữ liệu nghiệp vụ và quota/rate-limit dùng MongoDB Atlas. Không cần Docker cho cấu hình một máy này.

Trang thanh toán tạo VietQR động bằng Quick Link chính thức với BIN MB Bank, số tiền và nội dung riêng của từng đơn. SePay webhook xác nhận giao dịch và frontend tự cập nhật trạng thái mỗi 5 giây.

Triển khai lại an toàn (tự backup MongoDB và uploads trước khi build):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\deploy-server.ps1
```

Các tiến trình server ghi PID/log trong `.runtime/`. `deployment/run-server.ps1` khởi động backend và hai worker; `deployment/stop-server.ps1` chỉ dừng tiến trình đã xác minh đúng executable/command line và đặt maintenance marker để supervisor không tự bật lại. Scheduled task `AI Sales Assistant Server` tự phục hồi tiến trình; `AI Sales Assistant Backup` tạo MongoDB Extended JSON ZIP và ZIP uploads mỗi ngày, giữ 14 ngày. Cloudflare Tunnel phải tiếp tục ở trạng thái `Running / Automatic`.

Vì tác vụ startup cấp user chỉ chạy sau khi tài khoản Windows đăng nhập, muốn server chạy trước đăng nhập cần mở PowerShell bằng quyền Administrator và đăng ký scheduled task/service tương ứng.

Luồng hiện tại: Internet → Cloudflare Tunnel → FastAPI `127.0.0.1:8000` → MongoDB Atlas qua TLS.

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
