# Đo tác động của blocking trong async

Đây là app thực nghiệm riêng, không được gắn router vào ứng dụng bán hàng.
Không có database, người dùng, Gemini, thanh toán hoặc dữ liệu thật.

## Probe dependency validation và thread

Trong `source/backend`, chạy:

```powershell
.\.venv\Scripts\python.exe benchmarks/probe_mechanisms.py --output ../docs/evidence/20261022/mechanisms
```

`probe_mechanisms.py` tạo ứng dụng thử riêng, dùng dependency `shared/left/right` giả để quan sát cache trong một request, `use_cache=False`, cleanup của `yield`, lỗi Pydantic 422 và thread của endpoint `def/async def`. Không kết nối MySQL. Phần graph/OpenAPI chỉ đọc cấu trúc app thật, không gọi các endpoint nghiệp vụ.

Code nằm cạnh lệnh này; output `mechanisms.json` và `openapi.json` ghi rõ scope và phiên bản. Trong `mechanisms.json`, request `/cached` đầu và cuối đều có một lần enter/exit mới; `/uncached` có hai lần. Không dùng số thread ID hoặc số dòng framework như giá trị cố định cho mọi máy.

Minh chứng API/worker/MySQL thật và ảnh trình duyệt được ghi riêng trong `docs/ACCEPTANCE_20261022.md`, không coi probe này là E2E sản phẩm.

## Đo blocking so với await và thread

- `/blocking`: cố tình gọi `time.sleep(0.03)` trong `async def`.
- `/await`: `await asyncio.sleep(0.03)` mô phỏng chờ I/O không chặn event loop.
- `/thread`: endpoint `def`, FastAPI đưa phần xử lý đồng bộ vào thread pool.

Cài k6 từ https://grafana.com/docs/k6/latest/set-up/install-k6/ hoặc tải bản Windows
từ https://github.com/grafana/k6/releases. Không cần thêm k6 vào dependency chạy web.

Trong thư mục backend:

```powershell
.\.venv\Scripts\python.exe benchmarks/measure_async.py --k6 "C:\duong-dan\k6.exe" --output "..\docs\evidence\async-benchmark"
```

Script dùng 1 worker Uvicorn, 10 virtual users, 100 request mỗi trường hợp.
Chỉ bind `127.0.0.1` và từ chối cổng đang được dùng. Cuối bài thử, script dừng
đúng tiến trình đã tạo, không dừng server của người dùng.

`summary.json` chứa môi trường, throughput, p95, thời gian trung bình và tỷ lệ lỗi.
Ba JSON và log k6 giữ số đo gốc để đối chiếu. Một lần đo local không đủ kết luận
hiệu năng production. Thread pool cũng không biến phép tính CPU nặng thành async I/O.
