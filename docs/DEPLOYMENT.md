# Triển khai trên máy cá nhân

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
