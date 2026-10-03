import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";
import { api } from "../services/api";
import type { PublicPlan } from "../types";

const features = [
  {
    number: "01",
    title: "Trả lời từ dữ liệu của bạn",
    description: "Đưa tài liệu sản phẩm, chính sách và bảng giá vào kho tri thức. Trợ lý chỉ dùng nội dung đã được phê duyệt để tư vấn.",
  },
  {
    number: "02",
    title: "Hiểu khách đang cần gì",
    description: "Xem lại câu hỏi, cuộc hội thoại và thông tin liên hệ khách tự nguyện để lại, ngay trong một nơi làm việc.",
  },
  {
    number: "03",
    title: "Có mặt trên website của bạn",
    description: "Tạo chatbot, xem trước và chèn một đoạn mã ngắn vào website. Bạn kiểm soát lời chào, màu sắc và lượt chat.",
  },
];

const steps = [
  ["Tạo trợ lý", "Đặt tên và chọn cách trợ lý chào khách."],
  ["Thêm tài liệu", "Tải PDF, Word hoặc Excel; chờ phê duyệt trước khi sử dụng."],
  ["Đưa lên website", "Sao chép mã nhúng và theo dõi cuộc hội thoại trong ứng dụng."],
];

export function HomePage() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api<PublicPlan[]>("/public/plans") });
  const starterPrice = plans.data?.find((plan) => plan.code === "C1000")?.price_vnd;

  return (
    <div className="marketing-shell min-h-screen text-[#17233a]">
      <PublicNav />
      <main>
        <section className="landing-hero border-b border-[#dce2e9] px-5 py-18 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="eyebrow">Trợ lý AI cho website bán hàng</p>
              <h1 className="mt-6 max-w-2xl text-[clamp(3rem,5.5vw,5.6rem)] font-bold leading-[1.04] tracking-[-0.065em] text-[#17233a]">
                Khách hỏi.<br />Trợ lý hiểu.<br /><span className="text-[#2455c7]">Bạn bán hàng tốt hơn.</span>
              </h1>
              <p className="section-copy mt-7 max-w-xl">
                Biến tài liệu sản phẩm thành những câu trả lời dễ hiểu, đúng giá và sẵn sàng tư vấn ngay trên website của bạn.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/register" className="btn-swiss-primary px-6 py-3">Tạo trợ lý miễn phí <span aria-hidden="true">→</span></Link>
                <a href="#how-it-works" className="btn-swiss-secondary px-6 py-3">Xem cách hoạt động</a>
              </div>
              <p className="mt-7 text-sm text-slate-500">20 lượt chat miễn phí ban đầu · 1 chatbot · Không cần thẻ thanh toán</p>
            </div>

            <div className="preview-window p-0" aria-label="Ví dụ giao diện trả lời của trợ lý">
              <div className="flex items-center justify-between border-b border-[#dce2e9] px-6 py-4">
                <span className="text-sm font-bold">Xem trước cuộc trò chuyện</span>
                <span className="text-xs font-medium text-[#16714c]">Ví dụ minh họa</span>
              </div>
              <div className="space-y-5 bg-[#fafbf9] p-5 sm:p-7">
                <div className="ml-10 border border-[#dce2e9] bg-white p-4 text-sm leading-6 text-slate-700">
                  Máy lọc nước RO 8 lõi giá bao nhiêu và bảo hành thế nào?
                </div>
                <div className="mr-6 border border-[#dce2e9] border-l-[3px] border-l-[#2455c7] bg-white p-5">
                  <p className="text-xs font-bold tracking-wide text-[#2455c7]">TRỢ LÝ BÁN HÀNG</p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">Dạ, mẫu máy lọc nước RO 8 lõi đang có thông tin như sau:</p>
                  <div className="mt-4 border-t border-b border-[#dce2e9] py-4">
                    <p className="text-sm font-semibold text-slate-800">Máy lọc nước RO 8 lõi</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#2455c7]">6.890.000 ₫</p>
                    <p className="mt-2 text-sm text-slate-600">Bảo hành 24 tháng · Đã gồm VAT</p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-700">Bạn muốn mình hỗ trợ kiểm tra chi phí lắp đặt không ạ?</p>
                </div>
                <p className="border-t border-[#dce2e9] pt-3 text-xs text-slate-500">Câu trả lời trên là ví dụ giao diện, không phải thông tin sản phẩm của bạn.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white px-5 py-20 lg:px-8 lg:py-26">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
              <div>
                <p className="eyebrow">Một nơi cho cả hành trình bán hàng</p>
                <h2 className="section-title mt-4">Ít thao tác hơn. Tư vấn rõ ràng hơn.</h2>
                <p className="section-copy mt-5">Từ câu hỏi đầu tiên đến lúc khách để lại thông tin, mọi thứ được giữ trong cùng một quy trình dễ theo dõi.</p>
              </div>
              <div>
                {features.map((feature) => (
                  <div key={feature.number} className="feature-row grid gap-4 py-7 sm:grid-cols-[52px_1fr]">
                    <span className="text-sm font-bold text-[#2455c7]">{feature.number}</span>
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-[#17233a]">{feature.title}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-[#dce2e9] bg-[#eef2f9] px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <p className="eyebrow">Bắt đầu đơn giản</p>
            <h2 className="section-title mt-4 max-w-2xl">Từ tài liệu đến một trợ lý trên website trong ba bước.</h2>
            <div className="mt-12 grid gap-px border border-[#dce2e9] bg-[#dce2e9] md:grid-cols-3">
              {steps.map(([title, description], index) => (
                <div key={title} className="bg-white p-7 lg:p-9">
                  <span className="text-sm font-bold text-[#2455c7]">0{index + 1}</span>
                  <h3 className="mt-8 text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-white px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="eyebrow">Chi phí rõ ràng</p>
              <h2 className="section-title mt-4">Bắt đầu miễn phí. Mở rộng khi bạn cần.</h2>
              <p className="section-copy mt-4">Bạn không cần chọn một gói lớn ngay từ đầu. Tạo trợ lý trước, sau đó mua thêm lượt chat hoặc vị trí chatbot trong ứng dụng.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <div className="border border-[#dce2e9] bg-[#fafbf9] p-7 lg:p-9">
                <p className="text-sm font-semibold text-slate-600">Khởi đầu</p>
                <p className="mt-3 text-4xl font-bold tracking-tight">0 ₫</p>
                <div className="mt-7 space-y-3 border-t border-[#dce2e9] pt-6 text-sm text-slate-700">
                  <p>20 lượt chat miễn phí ban đầu</p>
                  <p>1 vị trí chatbot</p>
                  <p>Tải tài liệu và nhúng trợ lý lên website</p>
                </div>
                <Link to="/register" className="btn-swiss-secondary mt-8 w-full">Tạo tài khoản miễn phí</Link>
              </div>
              <div className="border border-[#2455c7] bg-[#edf3ff] p-7 lg:p-9">
                <p className="text-sm font-semibold text-[#1947b2]">Mở rộng theo nhu cầu</p>
                <p className="mt-3 text-4xl font-bold tracking-tight text-[#17233a]">{starterPrice != null ? `${starterPrice.toLocaleString("vi-VN")} ₫` : "Xem trong ứng dụng"}</p>
                <p className="mt-1 text-sm text-slate-600">{starterPrice != null ? "Tham khảo gói 1.000 lượt chat" : "Giá gói được cập nhật trực tiếp khi dịch vụ hoạt động"}</p>
                <div className="mt-7 space-y-3 border-t border-[#ccdafa] pt-6 text-sm text-slate-700">
                  <p>Lượt đã mua được phân bổ cho từng chatbot</p>
                  <p>Mua thêm vị trí chatbot khi cần</p>
                  <p>Thanh toán qua mã VietQR</p>
                </div>
                <Link to="/register" className="btn-swiss-primary mt-8 w-full">Bắt đầu và xem các gói</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[#dce2e9] bg-[#f8f9f7] px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.7fr_1.3fr]">
            <div><p className="eyebrow">Giải đáp nhanh</p><h2 className="section-title mt-4">Những điều bạn cần biết.</h2></div>
            <div className="space-y-3">
              {[
                ["Nếu tài liệu chưa có sản phẩm khách hỏi thì sao?", "Trợ lý sẽ nói chưa tìm thấy thông tin phù hợp thay vì tự đặt ra giá hoặc thông số."],
                ["Khách có cần đăng ký để trò chuyện không?", "Không. Khách có thể sử dụng widget trực tiếp trên website của bạn."],
                ["20 lượt miễn phí có làm mới mỗi ngày không?", "Không. Đây là 20 lượt ban đầu khi tạo tài khoản. Bạn có thể mua thêm lượt khi cần."],
              ].map(([question, answer]) => (
                <details key={question} className="border border-[#dce2e9] bg-white p-5">
                  <summary className="flex list-none items-center justify-between gap-4 text-base font-semibold text-[#17233a]">{question}<span aria-hidden="true" className="text-xl font-normal text-[#2455c7]">+</span></summary>
                  <p className="mt-4 border-t border-[#dce2e9] pt-4 text-sm leading-7 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dce2e9] bg-white px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-end">
          <div><p className="text-lg font-bold tracking-tight">Mạch <span className="text-[#2455c7]">AI</span></p><p className="mt-2 text-sm text-slate-500">Trợ lý bán hàng dựa trên dữ liệu của bạn.</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
            <Link to="/privacy" className="hover:text-[#2455c7]">Bảo mật</Link>
            <Link to="/terms" className="hover:text-[#2455c7]">Điều khoản</Link>
            <Link to="/data-policy" className="hover:text-[#2455c7]">Xử lý dữ liệu</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
