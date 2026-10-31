# Probe cơ chế FastAPI ngày 22 tháng 10 năm 2026

Thư mục giữ cùng nhau mã nguồn chụp tại mốc kiểm tra, lệnh chạy và output. `probe_mechanisms.source.txt` chỉ là bản lưu để đối chiếu, không phải file thực thi thứ hai. Mã có thể chạy và chỉnh sửa nằm ở `backend/benchmarks/probe_mechanisms.py`, tính từ `source`.

## Lệnh đã chạy

Mở PowerShell tại `source/backend`:

```powershell
.\.venv\Scripts\python.exe benchmarks/probe_mechanisms.py --output ../docs/evidence/20261022/mechanisms
```

## Output và phạm vi

- `mechanisms.json` có phiên bản thư viện, chuỗi enter/exit, thread và lỗi input 422. `/cached` gọi dependency chung một lần; `/uncached` gọi hai lần; request mới tạo vòng đời mới.
- Các dependency `shared/left/right` là giả, được dùng trong một FastAPI app độc lập. ASGITransport gọi app trong process, không phải HTTP qua server Uvicorn.
- `application_graph_read_only` và `openapi.json` đọc cấu trúc app thật, không gọi endpoint sản phẩm và không mở kết nối MySQL.
- MySQL, retry và demo trình duyệt có minh chứng riêng ở thư mục cha; không dùng probe này để thay kết quả E2E hoặc xác nhận giao dịch SQL.
- Đường dẫn/dòng source FastAPI, Starlette và thread ID là thông tin của môi trường đã đo. Không coi chúng là giá trị cố định cho mọi phiên bản.

Hash SHA-256 của snapshot và file thực thi được lưu trong `source-hash.json`. Nếu sửa probe, cần chạy lại và cập nhật snapshot/output cùng một mốc; không ghép code mới với output cũ.
