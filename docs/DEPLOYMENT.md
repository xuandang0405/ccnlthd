# Triển khai Windows hiện tại

Luồng một máy: trình duyệt → HTTPS/Cloudflare Tunnel (nếu dùng domain) → FastAPI `127.0.0.1:8000` → MongoDB Atlas. FastAPI phục vụ API và bản build React; document worker và notification worker chạy cùng `run.bat`. Bộ đếm lượt dùng/rate-limit hiện dùng MongoDB. Máy chạy website không cần Docker.

## Cài lần đầu

Làm theo [INSTALLATION.md](INSTALLATION.md): tạo lại virtual environment trên đúng máy, cài backend, `npm ci` và build frontend, cấu hình `backend/.env`, kiểm tra MongoDB. Đặt `APP_PUBLIC_URL`, `FRONTEND_ORIGIN` và `APP_DOMAIN` đúng domain đang dùng. Trong Cloudflare Tunnel, trỏ hostname tới `http://127.0.0.1:8000`; không chuyển HTTPS trực tiếp vào Uvicorn HTTP. Kiểm tra hostname/DNS/Tunnel thực tế trước khi công bố URL.

`run.bat` chỉ chạy server khi cửa sổ mở và dừng các PID cũ của chính dự án trước khi khởi động. Nó không cài package, không build frontend và không tự bật lại sau khi máy khởi động. Sau khi chạy, kiểm tra `/health/live` và `/health/ready`; nếu `ready` trả 503, đọc log trong cửa sổ để xác định MongoDB hoặc rate-limit backend chưa sẵn sàng.

## Cập nhật bản triển khai

1. Sao lưu MongoDB và thư mục `backend/storage/uploads` ra vị trí an toàn; kiểm tra file sao lưu trước khi thay đổi.
2. Review thay đổi và kiểm tra CI. Dừng server đang mở bằng Ctrl+C.
3. Trên máy triển khai, chạy `npm ci --prefix frontend`, `npm run build --prefix frontend`; trong `backend`, chạy `.\.venv\Scripts\python.exe -m pip install -e .` và `python ..\deployment\prepare-mongodb.py` bằng Python của venv.
4. Mở `run.bat`, xác nhận `health/ready`, đăng nhập bằng tài khoản test và thử một luồng widget. Nếu lỗi, giữ bản code/config và backup trước đó để quay lại; không xóa MongoDB production.

`deployment/deploy-server.ps1` là đường triển khai có backup tự động, nhưng có thao tác dừng tiến trình và ghi backup trong `.runtime`; chỉ dùng khi đã kiểm tra cấu hình và dung lượng đĩa. Không chạy `pytest` trỏ vào Atlas production vì fixture xóa database test.

## Việc cần xác minh ngoài mã nguồn

- Chứng chỉ HTTPS và truy cập từ mạng bên ngoài; hostname Tunnel phải đúng domain đang công bố.
- Kết nối MongoDB Atlas, IP Access List, backup và diễn tập restore trên database riêng.
- Gemini key/model/quota; webhook SePay thật; Telegram/SMTP nếu bật.
- Log và cảnh báo vận hành, chính sách lưu/xóa dữ liệu, kiểm tra bảo mật trước khi phục vụ người dùng thật.
