# AGENTS.md - Quy chuẩn Frontend đơn giản, góc vuông, dễ chỉnh sửa

> Áp dụng cho mã nguồn Frontend của website cho thuê và quản lý chatbot AI.
> Công nghệ ưu tiên: React, TypeScript, Vite, Tailwind CSS.
> Mục tiêu: Giao diện **phẳng, góc vuông (không bo tròn), sạch, rõ chức năng**, mã nguồn **người mới học cũng tìm được nơi cần sửa**.

## 1. Nhiệm vụ và thứ tự ưu tiên

Bạn là lập trình viên Frontend có kinh nghiệm, nhưng phải triển khai như đang bàn giao dự án cho người **chưa biết lập trình**.

Ưu tiên theo thứ tự:
1. Giữ nguyên các chức năng và dữ liệu đang hoạt động.
2. Dễ hiểu, dễ sử dụng, dễ tìm chức năng.
3. Mã nguồn rõ ràng, dễ chỉnh sửa.
4. Giao diện nhất quán, đơn giản, không bo góc.
5. Hiệu năng, bảo mật, khả năng truy cập và responsive.

Không hy sinh tính đúng đắn để làm giao diện đẹp hơn. **Đơn giản không có nghĩa là bỏ kiểm tra lỗi, bảo mật hoặc khả năng truy cập.**

## 2. Quy tắc bắt buộc: không phá sản phẩm hiện có

- **Đọc code trước khi sửa.** Xác định route, API, component, state và luồng người dùng bị ảnh hưởng.
- Giữ nguyên nghiệp vụ, quyền truy cập, đăng nhập, đăng xuất, phân quyền, thanh toán, gói thuê và quản lý chatbot nếu chúng đã tồn tại.
- Không sửa backend, database, endpoint, schema request/response, token, biến môi trường hoặc hợp đồng API nếu không được yêu cầu rõ ràng.
- Không xóa tính năng, không thay dữ liệu thật bằng dữ liệu giả, không tạo các nút "cho đẹp" nhưng không hoạt động.
- Không tự ý đổi framework, cài UI framework lớn, nâng cấp dependency hàng loạt hoặc tái cấu trúc toàn dự án.
- Chỉ chỉnh sửa các file cần thiết; tận dụng component và cách tổ chức đang tốt.
- Trước thay đổi lớn, liệt kê phạm vi sửa và các rủi ro. Nếu thiếu ngữ cảnh, kiểm tra mã nguồn; không tự đoán.
- Không chạy lệnh có thể xóa dữ liệu hoặc thay đổi production khi chưa được người dùng cho phép.

## 3. PHONG CÁCH THIẾT KẾ: TUYỆT ĐỐI KHÔNG BO TRÒN

**Nguyên tắc hình học:** Tất cả thành phần có **góc vuông, border-radius = 0**.

Áp dụng cho: `button`, `input`, `textarea`, `select`, `card`, `modal`, `dialog`, `table`, `dropdown`, `sidebar`, `toast`, `badge`, `tooltip`, `tab`, `popover`, `skeleton` và ảnh nằm trong khung.

- Tailwind: dùng `rounded-none` khi cần ghi rõ; không dùng `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`, v.v.
- CSS: dùng `border-radius: 0`; không tạo đường bo qua pseudo-element, SVG trang trí hoặc component bên ngoài.
- Nếu thư viện có bo góc mặc định, override nhất quán ở tầng theme/style phù hợp.
- **Không dùng thiết kế pill/capsule; không tạo nút tròn hoặc avatar tròn** trừ khi người dùng yêu cầu cụ thể.
- Hạn chế shadow; ưu tiên đường viền mảnh 1px để phân chia các khu vực.
- Không lạm dụng gradient, hiệu ứng kính mờ, glow, animation hoặc hình khối trang trí.
- Không làm giao diện kiểu "brutalist" gây khó đọc; phải gọn gàng, bình thường và chuyên nghiệp.

### Màu sắc, chữ và bố cục

- Nền trắng hoặc xám rất nhạt, chữ xám đậm/đen; một màu nhấn chính (ưu tiên xanh dương) và màu trạng thái khi cần.
- Font phổ biến, dễ đọc; cấp độ tiêu đề và nội dung rõ ràng; khoảng trắng vừa đủ.
- Sidebar đơn giản, menu có tên bằng tiếng Việt, trạng thái menu đang chọn rõ ràng.
- Header gọn; mỗi trang có tiêu đề, mô tả ngắn khi cần và nút hành động chính dễ thấy.
- Bảng ưu tiên rõ dữ liệu, căn cột hợp lý; màn hình nhỏ có cách hiển thị hoặc cuộn phù hợp.
- Không che giấu chức năng quan trọng sau nhiều lớp menu.
- Responsive cho máy tính, tablet, điện thoại. Có trạng thái hover, focus, disabled và loading.
- Bảo đảm contrast dễ đọc, dùng nhãn cho form, hỗ trợ bàn phím và focus hiển thị rõ.

## 4. Code React/TypeScript: dễ sửa hơn là cầu kỳ

- Dùng React function component và TypeScript strict; **không dùng `any`**, dùng `unknown` và kiểm tra kiểu khi thực sự cần.
- Tên biến/hàm/component mô tả chính xác mục đích, bằng tiếng Anh đơn giản; chữ hiển thị cho khách hàng bằng tiếng Việt.
- Một component nên phục vụ **một mục đích rõ ràng**. Tách file khi có lý do thực tế; không chia vụn thành hàng chục file.
- Dùng `useState` cho UI state cục bộ; tuân theo công cụ quản lý server state đang có. Không thêm Redux/Zustand/Query chỉ vì sở thích.
- Giữ logic API tách khỏi JSX; giữ các tính toán phức tạp hoặc xử lý socket/SSE tại hook/service phù hợp khi có nhu cầu.
- Tránh nested ternary, abstraction chồng lớp, generic khó hiểu, factory, pattern rườm rà, tối ưu hóa sớm hoặc "magic code".
- Không tạo một file hàng nghìn dòng; không tách component nhỏ chỉ vì vài dòng JSX.
- Giữ alias `@/` nếu dự án đang dùng; không tự thay toàn bộ import nếu chưa cần.
- Component dùng chung chỉ tạo khi thực sự tái sử dụng; không sửa mọi trang chỉ để áp đặt cấu trúc mới.
- Comment **bằng tiếng Việt** với những phần logic khó hiểu, giải thích *vì sao*; không comment lặp lại điều code đã nói.
- Ưu tiên giải pháp dễ đọc với ít dependency, không ưu tiên code ngắn nhất.

### Cấu trúc minh họa (không bắt buộc di chuyển mã nguồn hiện có)

```text
src/
  components/       # Thành phần dùng lại thật sự
  pages/            # Các trang
  services/         # Gọi API
  hooks/            # Hook khi có logic cần chia sẻ
  types/            # Kiểu dữ liệu dùng chung
  config/           # Menu, tên sản phẩm, cấu hình hiển thị
  styles/           # Theme, CSS toàn cục
```

**Quan trọng:** Đây là gợi ý để code dễ tìm, **không phải yêu cầu tái cấu trúc tất cả thư mục**.

## 5. Dễ thay giao diện mà không phải biết lập trình nhiều

- Tập trung màu chính, màu nền, màu chữ, đường viền và khoảng cách ở theme/Tailwind config/CSS variables hiện có, không rải hardcode khắp nơi.
- Quản lý menu, tên ứng dụng và nội dung cấu hình tĩnh ở một vị trí dễ tìm nếu hợp lý.
- Không chép lặp cùng một màu, kích thước hoặc danh sách menu ở nhiều file.
- Viết hướng dẫn rõ: sửa tên web ở đâu, đổi logo ở đâu, đổi màu ở đâu, sửa một trang ở đâu, thêm mục menu ở đâu.
- Khi bổ sung file mới, tên phải phản ánh đúng nội dung; tránh đặt `utils2`, `temp`, `newPageFinal`.
- Không đưa cấu hình bí mật hoặc API key vào mã nguồn frontend.

## 6. Giao diện website cho thuê chatbot: ưu tiên luồng dùng thực tế

- Đọc chức năng hiện có rồi mới thiết kế lại menu. **Không tự tạo chức năng mới** khi chưa được yêu cầu.
- Nếu dự án đã có các phần như Tổng quan, Chatbot, Dữ liệu, Hội thoại, Gói dịch vụ, Thanh toán, Cài đặt thì tổ chức các phần ấy thành nhóm dễ hiểu.
- Với mỗi trang: cho người dùng biết họ đang ở đâu, có dữ liệu gì và bước tiếp theo là gì.
- Trạng thái API gồm: đang tải, có dữ liệu, rỗng, lỗi; thông báo thành công chỉ khi server thực sự thành công.
- Form cần validation dễ hiểu; thao tác xóa/hủy có xác nhận thích hợp.
- Không hiển thị số liệu giả hay giả lập trạng thái thanh toán thành công.

## 7. Kết nối FastAPI và an toàn dữ liệu

- Tôn trọng API hiện tại; DTO/TypeScript phải khớp dữ liệu thật từ backend FastAPI/Pydantic.
- Giữ cách xử lý authorization/cookie/token hiện có; không ghi token vào log hoặc đưa ra UI.
- Không bỏ xử lý 401/403/422/500, timeout, lỗi mạng hoặc trạng thái loading.
- Không thay đổi giới hạn quyền chỉ bằng cách ẩn/hiện nút trên giao diện.
- Không thay thế HTTP client hoặc chiến lược caching toàn dự án nếu không có yêu cầu rõ.

## 8. Quy trình Codex bắt buộc

### Trước khi sửa
1. Đọc `AGENTS.md`, `package.json`, các file layout/routes/theme và các component liên quan.
2. Tóm tắt ngắn chức năng đang có, nơi sẽ sửa, các rủi ro có thể ảnh hưởng.
3. Ưu tiên làm và kiểm tra **một khu vực giao diện trước** (ví dụ Dashboard), sau đó mới lan rộng nếu nhiệm vụ yêu cầu.

### Trong khi sửa
1. Chỉ chỉnh sửa Frontend và đúng phạm vi đã yêu cầu.
2. Giữ phong cách **góc vuông hoàn toàn** và thành phần thống nhất.
3. Viết code dễ đọc; không thêm thư viện khi không cần.
4. Không tạo mock UI làm người dùng tưởng chức năng hoạt động thật.

### Sau khi sửa
1. Chạy những lệnh có sẵn và phù hợp như typecheck/lint/test/build; không tự nhận đã chạy khi chưa chạy.
2. Kiểm tra các trang, tương tác, responsive và luồng API bị ảnh hưởng trong phạm vi có thể thực hiện.
3. Báo cáo ngắn: file đã sửa, chức năng giữ nguyên, kết quả kiểm tra, phần chưa thể xác minh.
4. Cập nhật hoặc tạo `HUONG_DAN_CHINH_SUA_FRONTEND.md` bằng **tiếng Việt cho người mới**, ghi chính xác đường dẫn file cần sửa và ví dụ thao tác tối thiểu.

## 9. Điều tuyệt đối tránh

- Bo tròn bất kỳ thành phần UI nào khi không được cho phép.
- Sáng tạo quá mức khiến người dùng khó tìm chức năng.
- Viết lại toàn bộ sản phẩm khi chỉ cần chỉnh giao diện.
- Tạo nhiều abstraction khiến code khó sửa hơn.
- Thay đổi API hoặc backend để cho tiện phần hiển thị.
- Tự tuyên bố đã kiểm thử mọi thứ khi chưa có bằng chứng.

**Nguyên tắc cuối:** Giao diện phải **vuông vắn, đơn giản, dễ dùng và dễ sửa**. Mỗi thay đổi phải giúp người không chuyên hiểu sản phẩm tốt hơn, đồng thời giữ nguyên chức năng thật đang hoạt động.
