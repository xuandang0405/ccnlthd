# Cài đặt

## Docker Compose (khuyến nghị)

1. Cài Docker Desktop với WSL2 và bật tự khởi động cùng Windows.
2. Sao chép `.env.example` thành `.env`.
3. Tạo `APP_SECRET_KEY` ngẫu nhiên tối thiểu 32 ký tự và mật khẩu PostgreSQL riêng.
4. Điền `APP_DOMAIN`, `APP_PUBLIC_URL=https://<domain>` và `FRONTEND_ORIGIN=https://<domain>`.
5. Chỉ điền Gemini/SePay khi có credentials thật.
6. Chạy `docker compose config`, sau đó `docker compose up -d --build`.

PostgreSQL và Redis chỉ nằm trong mạng `internal`, không publish port ra host. Caddy là service duy nhất mở 80/443.

## Development trực tiếp trên Windows

Python 3.12+, Node 20+, PostgreSQL 16 và Redis 7:

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -e ".[dev]"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\uvicorn.exe app.main:app --reload
```

Terminal khác:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.workers.documents
cd ..\frontend
npm ci
npm run dev
```

SQLite chỉ phục vụ test/dev nhẹ; deployment phải dùng URL `postgresql+asyncpg://...`.
