# Backend

Backend của Trợ lý Việt dùng FastAPI, Pydantic và SQLAlchemy async với MySQL.

- `app/main.py`: tạo ứng dụng, middleware và gắn router.
- `app/api/`: endpoint và kiểm tra quyền truy cập.
- `app/schemas/`: dữ liệu đầu vào và đầu ra.
- `app/services/`: xử lý nghiệp vụ.
- `app/core/database.py` và `app/models/entities.py`: kết nối và model SQLAlchemy.
- `app/workers/documents.py`: xử lý tài liệu ngoài request upload.
- `migrations/`: các revision Alembic đang dùng.
- `tests/`: kiểm thử, mặc định dùng SQLite tạm.

Cách cài và chạy nằm trong [README của dự án](../README.md). Khi kiểm tra khóa và giao dịch đồng thời, dùng MySQL test riêng theo [hướng dẫn kiểm thử](../docs/QUALITY.md).
