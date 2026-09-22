# Cài đặt

## Cách nhanh nhất trên Windows

Nhấp đúp `run.bat`. Nếu Docker không có hoặc Docker Engine chưa chạy, script tự chuyển sang cấu hình local sau:

- FastAPI và hai worker chạy bằng virtual environment trong `backend/.venv`.
- React/Vite chạy tại `http://127.0.0.1:5173`.
- SQLite lưu dữ liệu tại `backend/sales_assistant.db`.
- Quota dùng bộ nhớ trong một tiến trình, không cần Redis.
- Log và PID nằm trong `.runtime/`; secret development được tạo ngẫu nhiên và không commit.

Yêu cầu: Python 3.12+ và Node.js 20+ có trong `PATH`. Lần chạy đầu cần Internet để cài dependency. Quota sẽ đặt lại khi backend khởi động lại, vì vậy cách này chỉ dành cho học tập, demo và phát triển.

## Docker Compose (production-like)

### Chạy tự động trên Windows

Nhấp đúp `run.bat` ở thư mục gốc. Script kiểm tra Docker, tự tạo `.env` an toàn nếu chưa có, khởi động toàn bộ service và chỉ mở website sau khi readiness check thành công. Script không ghi đè `.env` đã tồn tại và không xóa dữ liệu/volume.

1. Cài Docker Desktop với WSL2 và bật tự khởi động cùng Windows.
2. Sao chép `.env.example` thành `.env`.
3. Tạo `APP_SECRET_KEY` ngẫu nhiên tối thiểu 32 ký tự và mật khẩu PostgreSQL riêng.
4. Điền `APP_DOMAIN`, `APP_PUBLIC_URL=https://<domain>` và `FRONTEND_ORIGIN=https://<domain>`.
5. Chỉ điền Gemini/SePay khi có credentials thật.
6. Chạy `docker compose config`, sau đó `docker compose up -d --build`.

PostgreSQL và Redis chỉ nằm trong mạng `internal`, không publish port ra host. Caddy là service duy nhất mở 80/443.

## Development trực tiếp trên Windows (thủ công)

Nếu không dùng `run.bat`, có thể tự chạy Python 3.12+, Node 20+ với SQLite và quota bộ nhớ:

```powershell
$env:APP_ENV="development"
$env:APP_SECRET_KEY="development-secret-at-least-32-characters"
$env:DATABASE_URL="sqlite+aiosqlite:///./sales_assistant.db"
$env:RATE_LIMIT_BACKEND="memory"
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

SQLite và quota bộ nhớ chỉ phục vụ test/dev nhẹ. Deployment thật phải dùng PostgreSQL, Redis và `RATE_LIMIT_BACKEND=redis`.
