import { Link, useLocation } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";
import { siteConfig } from "../config/site";

const pages: Record<string, [string, string[]]> = {
  privacy: [
    "Bảo mật và quyền riêng tư",
    [
      `${siteConfig.name} xử lý thông tin tài khoản, tài liệu, cuộc hội thoại và thông tin liên hệ mà khách chủ động cung cấp để vận hành dịch vụ trợ lý bán hàng.`,
      "Tài liệu được gắn với doanh nghiệp đã tải lên. Quản trị viên hệ thống có thể xem và kiểm duyệt tài liệu để hỗ trợ vận hành và xử lý yêu cầu hỗ trợ.",
      "Khi sử dụng trợ lý, câu hỏi và phần nội dung tài liệu liên quan có thể được gửi tới dịch vụ AI của Google để tạo câu trả lời. Thanh toán sử dụng dịch vụ tích hợp bên ngoài; thông báo khách hàng mới được hiển thị trong trang quản lý của doanh nghiệp.",
      "Không nhập thông tin nhạy cảm không cần thiết vào cuộc trò chuyện. Nếu cần hỗ trợ về dữ liệu, hãy tạo yêu cầu trong mục Hỗ trợ sau khi đăng nhập.",
    ],
  ],
  terms: [
    "Điều khoản sử dụng",
    [
      "Người dùng cam kết không tải lên các tài liệu chứa nội dung độc hại, trái pháp luật hoặc vi phạm bản quyền thương mại.",
      "Tài khoản mới có 20 lượt chat miễn phí ban đầu và một vị trí chatbot. Giá, số lượt và thông tin chuyển khoản của các gói mua thêm được hiển thị trước khi tạo đơn hàng.",
      "Lượt mua thêm được ghi nhận sau khi hệ thống nhận và xác nhận giao dịch thanh toán phù hợp. Nếu đã chuyển tiền nhưng chưa được cộng lượt, hãy gửi mã đơn hàng trong mục Hỗ trợ.",
      "Tài khoản có thể bị tạm ngưng khi phát hiện hành vi lạm dụng dịch vụ hoặc gây rủi ro cho hệ thống. Trường hợp cần trợ giúp, hãy liên hệ qua mục Hỗ trợ.",
    ],
  ],
  "data-policy": [
    "Cách xử lý dữ liệu",
    [
      "Tài liệu của doanh nghiệp được trích xuất nội dung và lập chỉ mục để trợ lý có thể tìm thông tin liên quan đến câu hỏi của khách.",
      "Chỉ tài liệu đã được duyệt mới được sử dụng làm nguồn kiến thức cho chatbot. Nếu chưa có dữ liệu phù hợp, trợ lý cần nói rõ là chưa tìm thấy thông tin thay vì tự tạo giá hoặc thông số.",
      "Hệ thống lưu trạng thái xử lý tài liệu, lịch sử hội thoại và một số nhật ký thao tác để doanh nghiệp và quản trị viên theo dõi hoạt động.",
    ],
  ],
};

export function LegalPage() {
  const slug = useLocation().pathname.slice(1);
  const [title, paragraphs] = pages[slug] ?? pages.privacy;

  return (
    <div className="marketing-shell min-h-[100dvh] flex flex-col">
      <PublicNav />

      <main className="flex-1 mx-auto max-w-4xl px-5 py-16 w-full">
        <Link
          to="/"
          className="text-sm font-semibold text-slate-600 hover:text-brand inline-block mb-8"
        >
          ← Về trang chủ
        </Link>

        <article className="border border-[#dce2e9] bg-white p-8 md:p-12">
          <span className="eyebrow">Thông tin dịch vụ</span>
          <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-[#17233a]">
            {title}
          </h1>

          <div className="mt-8 space-y-6 text-base leading-8 text-slate-700 border-t border-slate-200 pt-6">
            {paragraphs.map((p, idx) => (
              <p key={idx} className="flex items-start gap-3">
                <span className="font-sans text-sm font-bold text-brand mt-1 shrink-0">
                  {idx + 1}.
                </span>
                <span>{p}</span>
              </p>
            ))}
          </div>

          <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">Cập nhật tháng 9/2026. Nếu có thắc mắc về nội dung này, vui lòng gửi yêu cầu trong mục Hỗ trợ.</p>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-6 text-sm font-sans text-slate-500 text-center">
        © 2026 {siteConfig.name} · {siteConfig.tagline}
      </footer>
    </div>
  );
}
