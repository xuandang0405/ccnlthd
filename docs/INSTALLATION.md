# Cài đặt trên Windows không dùng Docker

Luồng vận hành hiện tại: `run.bat` giữ FastAPI và hai worker chạy trong cửa sổ lệnh; FastAPI phục vụ luôn bản build React tại `frontend/dist`. MongoDB Atlas lưu dữ liệu nghiệp vụ và bộ đếm lượt dùng. Không cần chạy Vite riêng sau khi build.

## Yêu cầu

- Python 3.12 (kiểm tra bằng `py -0p`) và Node.js 22 + npm.
- Tài khoản MongoDB Atlas có quyền đọc/ghi và IP của máy chủ được cho phép truy cập. MongoDB phải hỗ trợ transaction/replica set.
- Internet để cài dependency, kết nối Atlas và gọi Gemini khi dùng tính năng AI.
- Cloudflare Tunnel/DNS/HTTPS chỉ cần khi muốn truy cập từ Internet; chạy local không cần chúng.

## Cài đặt lần đầu

Mở PowerShell tại thư mục `source`:

```powershell
py -3.12 -m venv .\backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -e .\backend
npm ci --prefix .\frontend
npm run build --prefix .\frontend
Copy-Item .\.env.example .\backend\.env
```

Nếu chép dự án từ máy khác và `.venv` vẫn chỉ về đường dẫn Python trên máy cũ, hãy **đổi tên thư mục `.venv` cũ để giữ bản dự phòng**, rồi tạo lại bằng lệnh ở trên. Không sao chép virtual environment giữa hai máy.

Mở `backend/.env` và điền tối thiểu:

```dotenv
APP_ENV=production
APP_PUBLIC_URL=http://127.0.0.1:8000
FRONTEND_ORIGIN=http://127.0.0.1:8000
APP_DOMAIN=127.0.0.1
DATABASE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=ai_sales_assistant
RATE_LIMIT_BACKEND=mongodb
UPLOAD_DIR=storage/uploads
APP_SECRET_KEY=<chuoi-ngau-nhien-toi-thieu-32-ky-tu>
```

Nếu dùng domain HTTPS thật, thay ba giá trị `APP_PUBLIC_URL`, `FRONTEND_ORIGIN`, `APP_DOMAIN` bằng URL/domain đó; `APP_DOMAIN` chỉ chứa tên host, không chứa `https://`. Điền thêm `GEMINI_API_KEY` và cấu hình SePay/ngân hàng nếu cần thử các tích hợp này. Không đưa `backend/.env` lên Git hoặc gửi cho người khác.

Kiểm tra kết nối Atlas trước khi chạy:

```powershell
Push-Location .\backend
.\.venv\Scripts\python.exe ..\deployment\prepare-mongodb.py
Pop-Location
```

Nhấp đúp `run.bat`, giữ cửa sổ mở, rồi vào `http://127.0.0.1:8000/`. Kiểm tra `http://127.0.0.1:8000/health/ready` trả về `status: ready`. Đóng cửa sổ hoặc nhấn Ctrl+C sẽ dừng server. `run.bat` không tự cài dependency hay build frontend. Các link domain in sẵn trong cửa sổ `run.bat` là cấu hình triển khai hiện tại; nếu đã đổi domain, cần đối chiếu lại với `backend/.env` và Cloudflare Tunnel.

## Kiểm thử và chạy lại trên máy khác

```powershell
Push-Location .\backend
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m ruff check app tests
Pop-Location
npm run lint --prefix .\frontend
npm test --prefix .\frontend
npm run build --prefix .\frontend
```

Backend API/integration tests cần **MongoDB replica set dành riêng cho test**. Mặc định chúng tìm `mongodb://127.0.0.1:27017/?replicaSet=rs0`; có thể chỉ định `TEST_MONGODB_URI` cho môi trường test tách biệt. Fixture sẽ xóa database `ai_sales_assistant_test` trước và sau mỗi test: tuyệt đối không trỏ `TEST_MONGODB_URI` vào cụm/dữ liệu production nếu chưa kiểm tra quyền và tên database. GitHub Actions tự dựng MongoDB tạm cho bộ test này; máy chạy server không cần Docker.
