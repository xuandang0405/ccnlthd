# Đối chiếu yêu cầu FastAPI và minh chứng nghiệm thu

Ngày kiểm tra: 14/10/2026. Đây là đối chiếu bản source local, chưa phải kết quả
GitHub Actions hoặc kiểm tra vận hành production. Không đưa secret vào minh chứng.

## Bảng phủ kỹ thuật

| Yêu cầu | File và hàm thực tế | Minh chứng hoặc test |
| --- | --- | --- |
| Routing, path/query/body và mã HTTP | `backend/app/api/*.py`; `app/main.py` include_router | `tests/test_api_contract.py`; OpenAPI trong `docs/evidence/20261014/openapi.json` |
| Pydantic request/response và 422 | `schemas/auth.py`; `schemas/error.py`; `core/errors.py` | `tests/test_api_contract.py`; `tests/test_lifecycle_and_validation.py`; HTTP 422 và ảnh Swagger |
| SQLAlchemy ORM/session | `core/database.py`: `SessionFactory`, `get_db`; `models/entities.py` | `tests/test_auth_and_tenants.py`; `tests/test_mysql_concurrency.py` |
| Migration Alembic | `backend/migrations/versions/20261010_mysql_initial.py`; `migrations/env.py` | Upgrade database thử riêng; `alembic check` không có thay đổi |
| Dependency auth và database | `api/deps.py`: `get_current_user`, `get_tenant_context`; `api/dashboard.py`: `summary` | `docs/diagrams/dashboard-dependencies.mmd`; test tenant/admin |
| Dependency cấu hình | `api/payments.py`: `sepay_webhook`, `Depends(get_settings)` | `tests/test_configuration_dependency.py`; `docs/diagrams/webhook-dependencies.mmd` |
| Endpoint async và I/O đang chờ | `api/documents.py`: `upload_document`; `api/auth.py`: `login` | `await to_thread.run_sync`, `await db.scalar`; test upload và auth |
| Endpoint đồng bộ có lý do | `app/main.py`: `frontend_index`, `frontend_spa` | `tests/test_error_handling.py`: kiểm tra thao tác file được chạy ở thread khác |
| Blocking được chuyển khỏi event loop | `core/security.py`: `hash_password_async`, `verify_password_async` | `tests/test_security_async.py`; dùng trong auth và admin reset |
| Exception handler thống nhất | `core/errors.py`: HTTP, validation, internal handlers | `tests/test_error_handling.py`: 401/402/403/404/409/422/429/500/503, header và không lộ input |
| Middleware, log và request ID | `app/main.py`: `request_context`; `core/observability.py` | `request-trace.json` khớp ID của `http-evidence.json`; test JSON formatter |
| Lifespan | `app/main.py`: `lifespan` | `tests/test_lifecycle_and_validation.py`: check schema và dispose cả khi startup lỗi |
| httpx và dependency override | `tests/conftest.py`; `tests/test_configuration_dependency.py` | Database/cấu hình được thay trong test, không thay dữ liệu người dùng |
| JWT, hết hạn và sai quyền | `core/security.py`; `api/deps.py`; `api/auth.py` | Token quá hạn, logout/revoke, refresh, user bị 403 ở API admin |
| Rate limit và nhất quán số dư | `services/credits.py`; `core/redis.py`: SQLRateLimitStore | Sáu test MySQL concurrency; 402 khác 429 |
| Worker nền riêng | `workers/documents.py` | `tests/test_workers_sql.py`; trạng thái SQL, claim/recovery tài liệu |
| Kiểm thử, coverage và CI | `backend/tests`; `.github/workflows/ci.yml` | JUnit/coverage XML trong `docs/evidence/20261014`; CI trên GitHub chưa chạy |
| Đo ảnh hưởng async | `backend/benchmarks/async_demo.py`, `async_load.js`, `measure_async.py` | k6 2.3.0; summary và số đo gốc ở `docs/evidence/20261014/async-benchmark` |

## Kết quả và cách đọc

- MySQL 8.4 riêng: 77 test đạt, không có test bỏ qua. Backend thử trên Windows,
  Python 3.14.7; MySQL chạy trong container. Không gọi đây là Python 3.12 trong container.
- SQLite trong bộ nhớ: 71 đạt, 6 test MySQL concurrency được bỏ qua.
- Độ phủ toàn `app`: dòng 82,56%; nhánh 57,12%; gộp dòng và nhánh 78,40%.
  Không loại file MongoDB cũ, CLI hoặc phần tích hợp chưa chạy ra khỏi tổng số này.
- Gate 80% trong CI chỉ áp dụng ba module errors/observability/security, đo được
  khoảng 95% gộp. Không coi đó là độ phủ 95% toàn backend.
- Frontend: 14 test đạt; ESLint, TypeScript và build đạt. Còn cảnh báo annotation zod.
- HTTP thật: readiness, 422, 401, auth/me, quyền admin 403, dashboard và API 404.
- Trình duyệt Edge headless: Swagger hiện được; login/user dashboard được tải;
  user truy cập `/admin` bị chuyển về `/app`. Đây là smoke test, không phải E2E đầy đủ.

## Đồ thị dependency và phạm vi dùng lại

`GET /api/v1/dashboard/summary` dùng chung `get_db` qua nhiều nhánh dependency.
FastAPI cache kết quả dependency trong một request; không phải cache một
`AsyncSession` cho mọi người dùng. `scope="function"` hoàn thành cleanup trước
khi trả response để lỗi commit còn có thể được xử lý.

`get_settings` có `lru_cache` cho instance cấu hình chung. Webhook nhận Settings
qua Depends, còn `authenticate_sepay` dùng đúng instance được truyền vào. Test
override có cleanup và không sửa cấu hình toàn cục. Luồng xác thực vẫn là API_KEY
hoặc HMAC như cũ. Hệ thống đăng nhập dùng HTTPBearer + JWT và JSON login,
không mô tả nhầm thành một OAuth2 password-flow chuẩn đã được triển khai.

## Định lượng và giới hạn

Thử nghiệm k6 dùng 1 worker Uvicorn, 10 người dùng ảo, 100 request mỗi trường hợp,
30 ms chờ giả lập; máy Windows có 20 CPU logic và RAM 16 GiB, không dùng database
hoặc connection pool. Blocking: 31,81 request/s và p95 317,07 ms; await: 218,37
request/s và p95 48,52 ms; thread: 282,91 request/s và p95 50,46 ms. Cả ba không
có lỗi. Chỉ đo một lượt local; không kết luận thread tốt hơn async trong mọi
trường hợp và không suy ra độ chịu tải Gemini/production.

Không tự thêm SSE/WebSocket, cache hoặc Celery chỉ để tăng số lượng mục tự chọn.
Nhóm chọn làm sâu validation, DI, async, SQL transaction, worker, log và test.
GitHub CI xanh, dịch vụ Gemini/SePay/SMTP thật, public HTTPS và E2E các
luồng còn lại vẫn cần kiểm tra riêng. Bản ZIP chia nhóm không phải bằng chứng CI.

## Cách tạo lại minh chứng

Trong `backend`, chạy test mặc định bằng `python -m pytest`. Muốn test MySQL,
`TEST_DATABASE_URL` phải trỏ database thử riêng theo `docs/QUALITY.md`, tuyệt đối
không trỏ vào `ccnlthd`. Fixture tạo/xóa bảng trong database test.

```powershell
python -m pytest --cov=app --cov-branch --cov-report=term-missing --cov-report=xml:coverage.xml --cov-report=html:htmlcov --junitxml=test-results.xml
python -m coverage report --include="*/core/errors.py,*/core/observability.py,*/core/security.py" --fail-under=80
```

Để tái hiện async, làm theo `backend/benchmarks/README.md`. Để lấy ảnh Swagger,
chạy server ở development/test, mở `/docs`, kiểm tra schema rồi chụp màn hình
không chứa token hoặc mật khẩu. Không bật docs production chỉ để chụp ảnh.
