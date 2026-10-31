# Chốt phiên bản và kiểm tra ba luồng chính — 26/10/2026

## Phiên bản thực sự đã chạy

- Source ID: `ed8ba4f7a1801d4aa57a90a484d20393397db82dd9df48a4a8f798f7d2c05df7`. Danh sách 204 file và SHA-256 ở `source-manifest.json`.
- Git HEAD `e6639c35e937153319fee66399d645168c236966` chỉ là commit nền. Source có thay đổi chưa commit; không dùng HEAD thay cho mã băm bản đang thử. Chưa commit/push hoặc nâng cấp database chính.
- ZIP source và snapshot database test: `../../../../nghiem-thu-20261026/final/`. ZIP không chứa .env thật, tệp người dùng hoặc database thật. Đây là bản chốt mã nguồn, không phải gói đã triển khai production.
- Backend/worker: `sha256:9a6cc39ff991f8335697032f82730623f4dd652a43961ca055b063251429a890`; frontend `sha256:aed1360e8a4cbf144a1152dea41053186e6d1cad6910603412bfb87f6dafd321`. 59 file Python trong container đã khớp SHA-256 với source local.
- Runtime: Python 3.12.15; mysql  Ver 8.4.11 for Linux on x86_64 (MySQL Community Server - GPL); schema `20261022_chat_retry`. Snapshot test có 32 bảng, gồm các bảng lịch sử migration. Không coi số bảng là số tính năng đang dùng.
- SDK và dependency chính xác nằm trong `docker-pip-freeze.txt`. Kết quả Docker dưới đây thuộc Python 3.12, không ghép với lần thử Python Windows 3.14.
- Cấu hình test: SQL rate counter; Gemini `gemini-3.1-flash-lite`, tổng timeout 50s, mỗi lần thử 10s; SMTP tắt, không cấu hình SePay. Khóa chỉ truyền qua môi trường, không lưu vào minh chứng.

## Những phần đã sửa

- `backend/app/services/budget.py`: đọc số tiền VND, so sánh mức giá với hạn mức và tính số chênh lệch trước khi mô hình diễn đạt. Câu hỏi kiểm tra giá đơn thuần không tự chuyển thành yêu cầu lọc ngân sách.
- `backend/app/integrations/gemini.py`: thêm ràng buộc không tự nâng ngân sách, không suy đoán giá/bảo hành, phải nói rõ số tiền vượt. Không đổi model hoặc hợp đồng API.
- `backend/app/services/retrieval.py`: bỏ biểu thức ngân sách khỏi từ khóa mã sản phẩm; 19tr không còn bị yêu cầu khớp như mã máy.
- `backend/app/services/fallback_chat.py`: khi dịch vụ ngoài lỗi, chỉ liệt kê mẫu có giá xác nhận không vượt ngân sách; không đủ dữ liệu thì nói rõ chưa xác nhận được.
- `backend/app/api/documents.py`: khóa bản ghi khi retry; trả 409 khi worker vẫn đang xử lý trong thời hạn 15 phút, tránh đưa lại công việc đang chạy vào hàng chờ.
- `backend/app/services/quota.py`: lỗi bộ đếm SQL trả 503 trước khi dự trữ lượt chat, không lộ lỗi kết nối nội bộ.
- `backend/app/api/public_chat.py`: log request ID, model, cờ fallback, ID tài liệu và SHA-256 ngữ cảnh; không ghi token, câu hỏi hoặc nội dung tài liệu vào log vận hành.

## Kết quả kiểm thử cuối

| Bộ kiểm tra | Đạt | Bỏ qua | Lỗi/thất bại | Minh chứng |
|---|---:|---:|---:|---|
| Backend Docker + MySQL 8.4 | 163 | 0 | 0 | mysql-final-junit.xml |
| Backend Docker + SQLite | 150 | 13 | 0 | sqlite-final-junit.xml |
| Frontend Node 24 | 28 | 0 | 0 | frontend-lint-test.log |

- Không cộng hai bộ backend thành một tổng. 13 bài bỏ qua trên SQLite cần khóa/giao dịch MySQL. Test endpoint, worker và cơ chế retry dùng stub LLM; chúng không thay cho kiểm tra Gemini thật.
- Lint backend và frontend đạt. Frontend đã qua TypeScript/build trong Dockerfile hiện có; ảnh frontend đó dùng cho các lần chụp trình duyệt. Lần chạy lại 28 test trên Windows là kiểm tra trùng phạm vi, không cộng thêm 28 bài.
- Kết quả trước chốt còn lưu trong các file `*-initial.xml`, `*-docker-junit.xml`, `browser-results.json`, `llm-recheck.json` và log pre-freeze. Lần thêm request trace làm một test gọi endpoint trực tiếp thiếu tham số Request; đã sửa lời gọi test rồi chạy lại đủ bộ. Các lỗi 503/timeout và fallback ban đầu vẫn giữ nguyên.

## Chatbot qua giao diện và Gemini thật

Các file XLSX được tạo riêng để tái hiện ranh giới giá kiểu UI-06; không phải dữ liệu khách hàng hoặc bản chạy lại toàn bộ bảng giá cũ. Upload đi qua API thật, worker thật, admin duyệt/thu hồi qua API thật. Tất cả câu hỏi dưới đây gửi bằng form widget; response, request ID, nguồn, ảnh và cờ không fallback được kiểm tra riêng. Không lấy HTTP 200 làm tiêu chí đủ.

| Ca | Kết quả mong đợi | Kết quả thực tế | Thời gian | Request ID | Ảnh |
|---|---|---|---:|---|---|
| pending | Không đưa giá/bảo hành PRIV37 hoặc nguồn chưa duyệt vào câu trả lời mới. | Đạt | 3.254s | `88a9eaf2-e243-4bd2-878d-b707fc5ac530` | [Ảnh](screenshots/final-pending-1.png) |
| approved | Đúng 14.321.987 VNĐ, 37 tháng và nguồn tài liệu đã duyệt. | Đạt | 1.449s | `c2ac86b5-bcca-4b9e-8681-90413dff849e` | [Ảnh](screenshots/final-approved-1.png) |
| revoked | Cùng phiên; câu trả lời mới không dùng giá/bảo hành hoặc nguồn vừa thu hồi. | Đạt | 3.513s | `64127ff6-c06d-49c3-9421-11b25ce15ea6` | [Ảnh](screenshots/final-revoked-1.png) |
| other-tenant | Không lộ 23.456.789 VNĐ, 49 tháng hoặc nguồn của Beta. | Đạt | 6.066s | `c9d2ccc3-392e-4490-8b4e-d636d24d7154` | [Ảnh](screenshots/final-other-tenant-1.png) |
| ui06 | Acer 19.890.000 VNĐ, 24 tháng; nêu vượt 19 triệu đúng 890.000 VNĐ. | Đạt | 4.182s | `48e74ecf-bb98-4059-86c4-0b3153c9359f` | [Ảnh](screenshots/final-ui06-1.png) |
| within-budget | Lenovo 18.990.000 VNĐ, 12 tháng; không coi Acer là trong ngân sách. | Đạt | 5.010s | `c44312e1-a7e7-4560-be6f-b0543faf6f04` | [Ảnh](screenshots/final-within-budget-1.png) |
| no-affordable-product | Không nhận có laptop đáp ứng 10 triệu; giá vượt trần phải ghi rõ. | Đạt | 4.802s | `a4606c6c-f49a-4d2b-b2a2-a623964acdb9` | [Ảnh](screenshots/final-no-affordable-product-1.png) |

- `llm-final.json` lưu đầy đủ câu hỏi/câu trả lời, source ID, image ID, ID phiên, ID tin nhắn, nguồn tài liệu, context hash và kết quả đối chiếu. `backend-final.log` có trace tương ứng cùng các HTTP 200 từ provider. Bảy ca cuối đều dùng Gemini thật; các lượt fallback trước đó không được đổi nhãn thành thành công LLM.
- PENDING → APPROVED → PENDING sau thu hồi được thử trong cùng phiên. Giá/bảo hành của câu trả lời cũ vẫn thuộc lịch sử; phạm vi kiểm tra là câu trả lời mới sau khi thu hồi, không phải xóa lịch sử cũ.
- Giá và bảo hành lấy từ từng dòng XLSX: Acer 19.890.000/24 tháng, Lenovo 18.990.000/12 tháng; Alpha PRIV37 14.321.987/37 tháng, Beta BETA49 23.456.789/49 tháng. Dữ liệu Beta không xuất hiện trong câu trả lời của Alpha.
- `acl-final.json` kiểm tra lại preview/retry tài liệu và sửa lead của tenant khác: đều 404 dù gửi Origin hợp lệ giả. Kiểm tra trước chốt còn có token widget khác chatbot bị 401. Public session có thể nhận Origin giả từ client ngoài trình duyệt; allowed_domains/CORS không phải xác thực người dùng.

## Lead và worker

- Lead: widget → POST /public/chat/.../leads → MySQL → trang thông báo polling. Không có worker lead hoặc bot Telegram. Ảnh `final-lead-polling.png` và `final-lead-after-restart.png` cho thấy lead NEW đã lưu, được thông báo sau 13177ms và còn sau restart API/worker; đăng nhập vẫn dùng được. Đánh dấu CONTACTED làm số NEW giảm nhưng giữ bản ghi `5128ccd4-f238-4274-ab63-56bc3b61cd83`.
- Worker tài liệu: tạm di chuyển đúng file test sau upload để gây FileNotFoundError, chờ FAILED, phục hồi file, gọi retry, chờ DONE/PENDING. Bản ghi `1c196094-70d8-4678-85ce-2588604fef34` có 1 chunk và 0 liên kết chatbot; xử lý xong không có nghĩa đã được duyệt.
- Test MySQL có hai session worker claim cùng tài liệu: chỉ một session nhận việc. Test xử lý lại không nhân đôi chunk/token; test retry đang PROCESSING nhận 409. Thu hồi công việc quá 15 phút được mô phỏng bằng timestamp trong test, không phải thử một tác vụ thật chạy 15 phút.
- Worker là tiến trình polling MySQL; không tuyên bố là queue phân tán hoặc bảo đảm exactly-once cho mọi tác vụ vượt thời hạn. Form liên hệ không có khóa idempotency chung cho mọi lần gửi; không coi mọi thao tác nhấn gửi là cùng một lead.

## Quota và retry

- 20 lượt miễn phí được cấp ban đầu; không phải 20 lượt/ngày. Ví lượt mua và lượt cấp riêng cho chatbot khác với giới hạn chống spam.
- Cửa sổ SQL: 30 lần thử/phút theo visitor session, bắt đầu từ lần đầu, không theo IP. Để tránh gọi LLM 30 lần chỉ nhằm thử bộ đếm, fixture riêng đặt counter=30 rồi gửi request tiếp theo thật. Đây không phải minh chứng 30 câu trả lời LLM thành công.
- Trước 429: `{"free": 20, "purchased": 0}`; sau 429: `{"free": 20, "purchased": 0}`. Không có ChatRequest dự trữ cho tin bị chặn. Counter 30 → 31; expiry không bị kéo dài.
- Mốc cửa sổ: `2026-10-26 15:59:09.497730` UTC, hết hạn `2026-10-26 16:00:09.273683` UTC. Đã chờ thời gian thật và restart API/worker; counter cũ vẫn còn sau restart. Sau hết hạn counter trở lại 1. Tổng thời gian quan sát 76184ms, số lượt miễn phí trừ cho câu sau cửa sổ: 1.
- Suite MySQL kiểm tra request trùng đồng thời, retry cùng client_message_id, ngắt kết nối trước commit tại bước dự trữ/kết thúc, và số dư ví miễn phí/lượt mua. Đây là fault injection trên MySQL test, không phải ngắt database thật của người dùng.

## Cách kiểm tra và giới hạn

- Đọc `acceptance-manifest.json` trước, đối chiếu `source-manifest.json`, rồi dùng `llm-final.json`, `flows-final.json`, JUnit và log theo request ID. Không chọn ảnh từ các mốc khác nhau để gọi là một lượt nghiệm thu.
- ZIP và database-test.sql có hash riêng; snapshot SQL chỉ chứa tài khoản/dữ liệu tổng hợp. Đây là snapshot cục bộ, không phải kiểm thử restore mới hoặc bằng chứng triển khai production. Các kết quả restore cũ vẫn giữ phạm vi riêng.
- Chưa nghiệm thu SePay TestMode/callback thật, SMTP thật, HTTPS/DNS hoặc tải toàn luồng. Chưa đo trường hợp admin thu hồi đúng lúc một yêu cầu LLM đang chạy. Không suy rộng bảy ca thành mọi biến thể câu hỏi đều đúng.
- Provider vẫn từng 503/timeout; lần cuối đạt 7/7 không xóa giới hạn này. Logic ngân sách hỗ trợ các cách ghi VND thông dụng đã có test; khoảng giá/giá chưa rõ không được fallback tự ghép chữ số thành một giá mới.
- Khi chạy lại: dùng database có tên bắt đầu ccnlthd_test_, giữ riêng dữ liệu thật; chạy pytest trong backend (mặc định SQLite), chỉ đặt TEST_DATABASE_URL vào database test MySQL. Lệnh frontend thực tế là npm run lint, npm test, npm run build. Các script tái hiện giao diện và dựng stack thử nằm ở thư mục tools của bản chốt, có ROOT/port/tên container riêng để kiểm tra trước khi chạy.
