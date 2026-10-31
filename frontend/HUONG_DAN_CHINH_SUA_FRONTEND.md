# Hướng dẫn chỉnh sửa frontend

Các đường dẫn bên dưới tính từ thư mục `source`. Mở PowerShell tại thư mục đó trước khi chạy từng nhóm lệnh.

Chạy Docker: xem `../docs/DOCKER.md`. Nginx trong `frontend/nginx.conf` proxy `/api`, `/health`, `/docs` sang backend nội bộ; không sửa API URL trong React. Trang `frontend/public/widget-test.html` nhận `?chatbotId=ID_CÔNG_KHAI` và dùng script cùng origin để test được cả local/Docker/domain.

Tài liệu dành cho nhóm mới học React. Giao diện dùng nền trắng, màu nhấn xanh và các khung góc vuông. Giá gói, quyền truy cập và dữ liệu được lấy từ API backend.

## 1. Cấu trúc frontend

- React, TypeScript strict, Vite, Tailwind CSS.
- React Router quản lý URL; TanStack Query tải dữ liệu và cập nhật lại sau thao tác.
- React Hook Form và Zod kiểm tra form đăng nhập/đăng ký; Lucide cung cấp icon.
- Không thêm thư viện giao diện, không thay dữ liệu thật bằng dữ liệu mẫu.

Các trang công khai: trang chủ, đăng nhập, đăng ký, quên mật khẩu, đặt mật khẩu mới, bảo mật, điều khoản, chính sách dữ liệu, widget chatbot.

Khu khách hàng có 10 mục hiện có: tổng quan; chatbot; tài liệu; thử trợ lý; hội thoại; khách hàng tiềm năng; gói và thanh toán; hỗ trợ; thông báo trên web; kiểm tra hệ thống. Không có trang thống kê hoặc hồ sơ cá nhân riêng nên không thêm menu giả cho các chức năng đó.

Khu admin có 8 mục: tổng quan; doanh nghiệp; người dùng; chatbot; duyệt tài liệu; hỗ trợ khách hàng; thanh toán; nhật ký quản trị.

Các chức năng được giữ: tạo/xóa chatbot, mã nhúng, cấp/thu hồi lượt, tài liệu và trạng thái duyệt, lịch sử hội thoại, khách hàng tiềm năng, gói thật, QR thanh toán, hỗ trợ kèm tệp/ảnh, thông báo khách hàng mới trên web và các thao tác quản trị hiện có.

## 2. Đổi tên website và logo

Mở `frontend/src/config/site.ts`.

```ts
import logoFull from "../../img/logo.png";
import logoIcon from "../../img/logo-2.png";

export const siteConfig = {
  name: "Trợ lý Việt",
  slogan: '"Khách không phải người yêu, nhưng phải được chiều"',
  logoFull,
  logoIcon,
  tagline: "Cho thuê chatbot tư vấn bán hàng",
  description: "Trợ lý Việt giúp bạn thuê và quản lý chatbot tư vấn bán hàng từ tài liệu sản phẩm, hỗ trợ khách hàng ngay trên website.",
};
```

- `name`: tên dịch vụ, alt của logo, nhãn liên kết và tiêu đề tab sau khi ứng dụng tải.
- `slogan`: tiêu đề chính ở trang chủ và câu giới thiệu trang tài khoản trên desktop. Trang chủ chỉ hiển thị một lần, không lặp lại ở dòng bên dưới. Giữ đúng dấu tiếng Việt.
- `tagline`: mô tả ngắn dùng ở trang chủ, trang chính sách và tiêu đề tab.
- `description`: mô tả dịch vụ trong metadata sau khi JavaScript tải.
- Hai ảnh gốc nằm tại `frontend/img/logo.png` và `frontend/img/logo-2.png`. Không di chuyển, đổi tên, chỉnh màu hay cắt ảnh chỉ để gắn vào giao diện. Vite xử lý import và sinh URL đúng cho bản build.
- Nếu sau này thay bằng file logo khác, sửa hai dòng import ở `site.ts`. Cập nhật kích thước ảnh gốc trong `frontend/src/components/Brand.tsx` và `frontend/src/pages/WidgetPage.tsx` nếu tỷ lệ ảnh mới khác. Không dùng đường dẫn ổ C làm URL ảnh.
- Component logo dùng chung là `Brand.tsx`: `<Brand />` dùng logo đầy đủ, `<Brand variant="icon" />` dùng biểu tượng, `<Brand variant="responsive" />` đổi sang biểu tượng khi màn hình nhỏ hơn 1024px. Logo đầy đủ đã chứa chữ nên không thêm một tên website bằng HTML ngay cạnh ảnh.
- Kích thước logo nằm trong các lớp `.brand-logo`, `.brand-icon`, `.brand-responsive`, `.auth-story .brand-logo` tại `frontend/src/styles.css`. Luôn giữ `object-fit: contain`; không dùng `object-cover`, filter đổi màu hoặc border-radius.
- Header công khai dùng logo responsive; sidebar mở rộng của user/admin dùng logo đầy đủ; header workspace trên màn hình nhỏ dùng biểu tượng. Sidebar hiện tại không có chế độ thu gọn trên desktop, không tạo thêm chức năng chỉ để gắn logo.
- Trang tài khoản có logo đầy đủ cả desktop lẫn mobile. Header bên trong iframe chatbot dùng biểu tượng thương hiệu, vẫn giữ màu mà chatbot đã cấu hình. Nút mở widget độc lập dùng robot SVG và nhãn "Trợ lý AI / Chat tư vấn" để khách nhận ra chức năng; thao tác mở/đóng và URL iframe không đổi.
- `frontend/vite.config.ts` tự xuất thêm ảnh gốc `logo-2.png` tới `dist/img/logo-2.png` khi build, để script độc lập `public/widget.js` và favicon trang test có URL cố định. Không chỉnh ảnh trong `dist`: đây là kết quả build, không phải ảnh nguồn. Nếu đổi file biểu tượng sau này, đồng bộ nguồn ảnh trong plugin `widget-brand-icon`.
- Favicon dùng `logo-2.png` tại `frontend/index.html`; Vite chuyển đường dẫn này thành asset trong bản build. `frontend/src/main.tsx` đồng bộ favicon, title và description theo `siteConfig` khi tải ứng dụng.
- Sửa thêm tiêu đề mặc định, description và đường dẫn favicon trong `index.html` nếu đổi thương hiệu sau này, để đồng bộ cả trước khi JavaScript tải. Dự án hiện chưa có metadata Open Graph; đợt này không tự đoán URL production để bổ sung.

Trang test widget là HTML độc lập: tên hiển thị và mã nhúng nằm ở `frontend/public/widget-test.html`. Mã chatbot trong đó có thể là mã cũ; khi test hãy lấy mã thật từ mục Chatbot của tôi. Đợt chỉnh giao diện này không tự đổi chatbot hoặc nguồn script của trang test.

## 3. Đổi màu, font và khoảng cách

Mở `frontend/src/styles.css`.

- `--color-primary`: màu nút chính và menu được chọn.
- `--color-primary-hover`: màu nút khi rê chuột.
- `--color-brand-soft` trong `@theme`: nền xanh nhạt.
- `--color-surface`: nền tổng thể.
- `--color-ink`, `--color-text-main`, `--color-text-secondary`: màu tiêu đề, nội dung, chữ phụ.
- `--color-border`: màu đường viền.
- `--font-ui`: font giao diện; `--font-mono`: font mã kỹ thuật.
- `--font-slogan`: font riêng cho tiêu đề slogan trang chủ. Lớp `.marketing-slogan` trong `frontend/src/styles.css` quản lý kích thước responsive, độ đậm, giãn dòng và màu chữ. Không đổi font toàn bộ dashboard để chỉnh slogan.
- `--space-page`: khoảng đệm trang; `--width-sidebar`: chiều rộng sidebar.

Slogan dùng Dancing Script có hỗ trợ tiếng Việt, lưu tại `frontend/public/fonts/DancingScript.ttf`, giấy phép đi kèm ở `public/fonts/DancingScript-OFL.txt`. Font tải từ chính website, không gọi Google Fonts khi người dùng mở trang. Muốn thay font: thêm file có giấy phép phù hợp vào thư mục này, đổi `@font-face` và `--font-slogan` trong CSS. Giữ `font-display: swap` để chữ vẫn hiện khi font chưa tải xong.

Kiểm tra font slogan ngày 09/10/2026: bản build đã tải đúng Dancing Script, chữ tiếng Việt hiển thị đủ và không tràn ngang ở 360/768/1280px. TypeScript/build, lint và 13 bài test hiện có đều đạt.

Tailwind `text-brand`, `bg-brand`, `border-brand` dùng chung màu primary. Nút dùng `btn-swiss-primary`, `btn-swiss-secondary` hoặc `btn-swiss-danger`; input dùng `input-swiss`; card dùng `card-swiss`. Tên lớp cũ được giữ để tránh sửa đồng loạt không cần thiết.

Không thêm `rounded-*`, không đặt border-radius khác 0. Không dùng màu thương hiệu mới rải rác trong từng trang. Các màu xanh/đỏ/vàng phụ chỉ dành cho trạng thái.

Widget nhúng dùng Shadow DOM nên CSS chung không đi vào nút mở và iframe ngoài. Muốn đổi màu nút đó, sửa phần `style.textContent` trong `frontend/public/widget.js`. Màu bên trong chatbot vẫn ưu tiên `primary_color` máy chủ trả về, không ghi đè cấu hình của khách hàng.

### Chỉnh nút mở chatbot trên website khách hàng

- File nguồn trên máy hiện tại: `D:/QUAN TRỌNG/CCNLTHD/source/frontend/public/widget.js`.
- Đổi nét mặt robot: sửa các đường `<path>` trong `botIcon.innerHTML`. Đây là SVG viết sẵn, không ghép dữ liệu khách hàng vào HTML.
- Đổi chữ trên nút: sửa `buttonTitle.textContent` và `buttonHint.textContent`; cập nhật `aria-label` nếu đổi ý nghĩa nút.
- Đổi kích thước hoặc màu: sửa `.launcher`, `.launcher svg` và `.launcher-label` trong `style.textContent`. Giữ `border-radius:0` và trạng thái focus bàn phím.
- Chạy `npm run build` trong thư mục frontend để cập nhật `dist/widget.js` khi chạy bằng `run.bat`. Nếu dùng Docker, rebuild dịch vụ frontend. Không sửa trực tiếp file trong `dist` hoặc thay mã chatbot trong script của khách.
- Nginx có `location = /widget.js` với `Cache-Control: no-cache` trong `frontend/nginx.conf`, để trình duyệt kiểm tra bản script mới khi tải lại. Lần đầu chuyển từ bản Docker cũ, nhấn `Ctrl+F5` trên trang đang nhúng; không cần đổi chatbot ID hoặc mã script.
- Thông báo sự cố cho khách dùng từ ngữ trung tính, không ghi tên nhà cung cấp AI. Thông báo mới ở `backend/app/services/fallback_chat.py`; lỗi tích hợp ở `backend/app/integrations/gemini.py`. Giữ thông tin nhà cung cấp trong log/cấu hình nội bộ để tìm lỗi; không đổi cơ chế hoàn lượt chỉ vì đổi câu thông báo.

## 4. Menu và layout

### Thông báo khách hàng trên web

- Trên máy hiện tại, sửa `D:/QUAN TRỌNG/CCNLTHD/source/frontend/src/components/LeadNotificationLink.tsx` để đổi nhãn hoặc cách hiển thị số khách mới ở header.
- Sửa `D:/QUAN TRỌNG/CCNLTHD/source/frontend/src/pages/customer/SettingsViews.tsx` để thay nội dung trang Thông báo.
- Chu kỳ 15 giây và API nằm ở `D:/QUAN TRỌNG/CCNLTHD/source/frontend/src/hooks/useCustomerWorkspace.ts`. Summary đếm khách `NEW`; danh sách thông báo gọi API có sẵn `/leads?status=NEW&page=1&page_size=5`.
- Không thêm số giả khi lỗi: nút hiện `!`, trang cho phép thử lại. Không coi mở xem là đã liên hệ. Nút **Đánh dấu đã liên hệ** chỉ cập nhật giao diện sau khi Backend xác nhận.
- Thông báo chỉ hoạt động trong trang quản lý đang mở; không yêu cầu quyền thông báo trình duyệt và không có cảnh báo khi đóng web. Xem `../docs/WEB_NOTIFICATIONS.md`.

Danh sách menu nằm cùng file `frontend/src/config/site.ts`.

- `customerNavigation`: menu khách hàng.
- `adminNavigation`: menu quản trị.
- `label`: tên người dùng nhìn thấy.
- `group`: nhóm chức năng.
- `id`: tên mục được code sử dụng.
- `href`: URL đích.

Ví dụ đổi chữ “Tài liệu” thành “Dữ liệu chatbot”: chỉ sửa `label` ở mục có `id: "documents"`. Không đổi id hoặc query parameter để đổi chữ.

Muốn thêm liên kết tới một mục đã có, dùng đúng URL có sẵn như `/app?view=documents`. Không thêm hai mục trùng id vì đó là khóa của React.

Muốn thêm một trang thực sự mới, cần có chức năng được yêu cầu trước. Sau đó bổ sung route trong `frontend/src/App.tsx`, bổ sung kiểu view/section và menu tương ứng ở `site.ts`, rồi render component ở trang điều phối. Thêm menu một mình không tạo ra chức năng.

Sidebar/header dùng chung: `frontend/src/components/WorkspaceLayout.tsx`. Menu công khai: `frontend/src/components/PublicNav.tsx`.

## 5. Sửa một trang: tìm đúng file

| Nội dung | File giao diện |
| --- | --- |
| Trang chủ | frontend/src/pages/HomePage.tsx |
| Đăng nhập, đăng ký, mật khẩu | frontend/src/pages/AuthPages.tsx |
| Chính sách | frontend/src/pages/LegalPage.tsx |
| Tổng quan khách hàng | frontend/src/pages/customer/OverviewView.tsx |
| Chatbot và thử trợ lý | frontend/src/pages/customer/ChatbotViews.tsx |
| Tài liệu | frontend/src/pages/customer/DocumentsView.tsx |
| Hội thoại, khách hàng tiềm năng | frontend/src/pages/customer/ConversationViews.tsx |
| Gói và số dư | frontend/src/pages/customer/BillingView.tsx |
| Hỗ trợ khách hàng | frontend/src/pages/customer/SupportView.tsx |
| Thông báo trên web và kiểm tra hệ thống | D:/QUAN TRỌNG/CCNLTHD/source/frontend/src/pages/customer/SettingsViews.tsx |
| Tổng quan admin | frontend/src/pages/admin/AdminOverview.tsx |
| Doanh nghiệp và người dùng | frontend/src/pages/admin/AdminAccounts.tsx |
| Chatbot của khách hàng | frontend/src/pages/admin/AdminChatbots.tsx |
| Duyệt tài liệu | frontend/src/pages/admin/AdminDocuments.tsx |
| Ticket, giao dịch, nhật ký | frontend/src/pages/admin/AdminOperations.tsx |
| Widget bên trong iframe | frontend/src/pages/WidgetPage.tsx |

Ví dụ sửa trang tài liệu:

1. Mở `frontend/src/pages/customer/DocumentsView.tsx`.
2. Đổi tiêu đề và mô tả trong JSX nếu cần. Đổi class để chỉnh khoảng cách.
3. Giữ `uploadDoc.mutate(file)`, `deleteDoc.mutate(id)`, dữ liệu và điều kiện trạng thái như cũ khi chỉ chỉnh giao diện.
4. Chạy lint, test và build; mở trang tài liệu với tài khoản test.

`DashboardPage.tsx` và `AdminPage.tsx` tại `frontend/src/pages/` chỉ điều phối layout và các nhóm trang. Không dồn mọi JSX trở lại hai file này.

## 6. Logic dữ liệu nằm đâu?

Các file dưới đây tách trạng thái và gọi API khỏi phần trình bày:

- `frontend/src/hooks/useCustomerWorkspace.ts`: dữ liệu và thao tác khách hàng.
- `frontend/src/hooks/useAdminWorkspace.ts`: dữ liệu và thao tác admin.
- `frontend/src/hooks/usePaymentCheckout.ts`: tạo đơn, kiểm tra trạng thái và cập nhật số dư sau xác nhận.
- `frontend/src/hooks/useWidgetChat.ts`: phiên khách, gửi tin và gửi thông tin liên hệ của widget.
- `frontend/src/hooks/useChatbotPreview.ts`: thử chatbot trong ứng dụng.

Không có thêm tầng repository, factory hay bộ quản lý state riêng. Mỗi hook phục vụ một màn hình/luồng rõ ràng.

API client hiện có: `frontend/src/services/api.ts`. Phiên đăng nhập: `frontend/src/auth.tsx`. Kiểu dữ liệu: `frontend/src/types.ts`. Không sửa token, header doanh nghiệp hoặc response để thay đổi giao diện.

Các nhóm API đang được dùng, tính từ base `/api/v1`:

| Nhóm | Endpoint tiêu biểu hiện có |
| --- | --- |
| Đăng nhập, phiên | /auth/login, /auth/register, /auth/me, /auth/refresh, /auth/password-reset/request, /auth/password-reset/confirm |
| Tổng quan, chatbot | /dashboard/summary, /chatbots, /chatbots/{id}/credits |
| Tài liệu | /documents, /documents/upload, /documents/{id}/preview, /documents/{id}/retry |
| Hội thoại, khách hàng | /conversations, /conversations/{id}, /leads |
| Thanh toán | /public/plans, /payments/products, /payments/balance, /payments/orders/product/{code}, /payments/orders/{id} |
| Hỗ trợ | /tickets, /tickets/{id}/replies, /tickets/{id}/attachments, /tickets/{id}/read |
| Thông báo khách hàng | /dashboard/summary, /leads?status=NEW, PATCH /leads/{id} |
| Admin | /admin/summary, /admin/organizations, /admin/users, /admin/chatbots, /admin/documents, /admin/tickets, /admin/payments, /admin/audit-logs |
| Kiểm duyệt | /admin/settings/moderation, /admin/documents/{id}/approval, /admin/documents/{id}/ai-review |
| Chat công khai | /public/chat/{publicId}/sessions, /public/chat/{publicId}/messages, /public/chat/{publicId}/leads |

Giá lấy từ API thật. Không sửa số tiền hiển thị riêng ở frontend để giảm giá: QR và quyền lợi phụ thuộc đơn hàng backend.

## 7. Component dùng chung

- Loading/error/empty: `frontend/src/components/Feedback.tsx`.
- Hộp thoại có Esc, focus và backdrop: `frontend/src/components/Dialog.tsx`.
- Thanh toán QR: `frontend/src/components/PaymentModal.tsx`.
- Xem tài liệu: `frontend/src/components/DocumentPreviewModal.tsx`.
- Thông tin kỹ thuật: `frontend/src/components/SystemArchitectureModal.tsx`.
- Chat hỗ trợ dùng chung admin/user: `frontend/src/components/TicketChat.tsx`.
- Định dạng câu trả lời và nhấn mạnh giá: `frontend/src/components/AssistantContent.tsx`. Nội dung được render thành text/JSX, không chèn HTML từ câu trả lời.
- Thử chatbot: `frontend/src/components/EnterpriseChatWorkspace.tsx`.
- Phân bổ lượt/phân trang: `frontend/src/components/WorkspaceControls.tsx`.
- Form quản trị: `frontend/src/components/AdminControls.tsx`.

Khi thêm input, dùng label nối với id hoặc label bao quanh input. Icon-only button phải có aria-label. Xóa dữ liệu cần giữ xác nhận. Chỉ báo thành công khi mutation đã thành công.

## 8. Chạy trên máy và kiểm tra

Máy cần Node.js/npm đáp ứng yêu cầu Vite đang cài; kiểm tra bằng `node --version` và `npm --version`. Backend cần môi trường Python và cấu hình hiện có của dự án; không chứa khóa bí mật trong mã frontend.

Mở PowerShell:

```powershell
cd .\frontend
npm ci
npm run dev
```

- Frontend dev mặc định: http://127.0.0.1:5173.
- Backend phải chạy riêng mới đăng nhập, tải dữ liệu, chat và thanh toán được.
- Proxy dev nằm ở `frontend/vite.config.ts`; mặc định trỏ API/health tới http://127.0.0.1:8000.
- Giá trị frontend nếu cần cấu hình nằm ở `frontend/.env`: `VITE_API_BASE_URL` là base API, `VITE_DEV_API_TARGET` là địa chỉ backend dev. Không đặt Gemini key, SePay key hay mật khẩu MongoDB vào biến VITE.
- Vite bỏ qua riêng file tạm `*.pdnSave` của trình sửa ảnh để tránh lỗi file bị khóa; không xóa ảnh.

Chạy bản giao diện đã build cùng server hiện có:

```powershell
cd .\frontend
npm run build
cd ..
.\run.bat
```

Backend phục vụ thư mục `frontend/dist`. Giữ cửa sổ `run.bat` mở và dừng bằng Ctrl+C. Nếu chưa thấy giao diện mới ở cổng 8000, build lại rồi tải lại trang.

Các lệnh kiểm tra thật:

```powershell
cd .\frontend
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm test
npm run build
```

`npm run preview` chỉ xem bản build frontend, không thay thế backend. Vite dev/preview không phải server production công khai.

## 9. Checklist nghiệm thu và giới hạn kiểm thử

- Kiểm tra desktop, tablet 768px, điện thoại 360px; bảng rộng phải cuộn bên trong, không kéo cả trang ngang.
- Dùng Tab/Enter để mở menu, chọn trang và nhập form. Esc đóng hộp thoại, focus quay về nút mở.
- Khi chưa đăng nhập, /app và /admin phải quay về /login. User thường không được vào admin; admin phải qua xác minh /auth/me như cơ chế cũ.
- Dùng tài khoản test kiểm tra tạo/xóa chatbot, phân bổ/thu hồi lượt, mã nhúng.
- Upload tài liệu test rồi đối chiếu trạng thái duyệt ở cả admin và user.
- Kiểm tra tìm hội thoại, phân trang, thay trạng thái khách hàng.
- Tạo ticket có ảnh/tệp, bỏ tệp trước khi gửi, trả lời từ admin và user.
- Thanh toán chỉ nghiệm thu khi có backend và webhook thật; không coi ảnh QR hoặc request tạo đơn là giao dịch thành công.
- Đăng xuất, refresh trình duyệt và thử phiên hết hạn.

### Gửi lại tin nhắn khi mất kết nối (22/10/2026)

- Logic dùng chung: `frontend/src/services/chatRetry.ts` (đường dẫn tính từ thư mục đồ án). Hai nơi sử dụng là `src/hooks/useWidgetChat.ts` và `src/hooks/useChatbotPreview.ts` bên trong frontend.
- Một lần gửi có `client_message_id` dạng UUID. Tự thử lại tối đa 3 lần gửi HTTP, giữ nguyên mã và nội dung; không dùng UUID mới trong vòng lặp retry. Gửi lại thủ công cùng câu đang lỗi, trong cùng phiên đang mở, cũng giữ mã này.
- Chỉ thử lại khi lỗi mạng/timeout, HTTP 502/503/504 hoặc HTTP 409 có `Retry-After`. Không tự thử lại lỗi đăng nhập, hết lượt, sai dữ liệu, xung đột nội dung hoặc rate limit. Mỗi lần chờ phản hồi tối đa 60 giây; backoff 1 rồi 2 giây, có xét `Retry-After` không quá 5 giây. Nếu máy chủ yêu cầu chờ lâu hơn thì hiển thị lỗi để người dùng quyết định gửi lại.
- Gửi thành công mới xóa mã chờ; sửa nội dung hoặc đổi phiên là câu hỏi mới. Mã đang chờ chỉ nằm trong bộ nhớ trang, không phục hồi sau tải lại/đóng trang. Không tự thêm retry vào chức năng thanh toán hoặc upload bằng helper này.
- Backend phải được nâng migration `20261022_chat_retry`; retry an toàn phụ thuộc bảng MySQL, không phải chỉ nhờ frontend. Chi tiết và kiểm thử tại `docs/CHAT_RETRY.md`.

### Kiểm tra từ trình duyệt và nguồn tài liệu (22/10/2026)

- `frontend/src/hooks/useChatbotPreview.ts`: xóa session cũ khi đổi chatbot; luôn cập nhật `activeSources` theo câu trả lời mới, kể cả mảng rỗng. Không giữ tên nguồn của câu trước khi tài liệu đã bị thu hồi duyệt.
- `frontend/src/pages/customer/DocumentsView.tsx`: trạng thái đang tải chỉ nói tải tệp, không làm người dùng hiểu rằng request đã xử lý xong tài liệu nền; sửa dấu ngoặc thừa ở điểm đánh giá.
- Đã thử trên Edge với API, MySQL và worker riêng: login/quyền admin, upload/duyệt, hai tenant, chat, worker lỗi/thử lại, ticket có ảnh, đơn QR và webhook tự ký local. Widget ở website khác origin tải được. Ảnh và giới hạn nằm trong `docs/ACCEPTANCE_20261022.md`.
- Gemini trả 401 ở thời điểm thử nên ảnh chat thể hiện fallback rõ ràng; webhook local không phải SePay Test Mode. Không dùng những ảnh này để tuyên bố các tích hợp ngoài đã nghiệm thu.

Các bài kiểm thử tự động nằm tại `frontend/tests/`: API/header/upload/error, quota, menu, trạng thái hỗ trợ bàn phím và định dạng câu trả lời.

Kết quả theo từng lần chạy được lưu tại `docs/evidence/`. Bộ ngày 26/10/2026 có thông tin môi trường, ảnh và giới hạn riêng trong `docs/evidence/20261026-final-flows/README.md`. Sau khi sửa source, chạy lại các lệnh kiểm tra ở mục 8 và lưu kết quả cùng commit mới.
