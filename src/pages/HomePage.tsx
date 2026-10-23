import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";
import { api } from "../services/api";
import type { PublicPlan } from "../types";
import { Brand } from "../components/Brand";
import { siteConfig } from "../config/site";

const steps = [
  ["01", "Tạo chatbot", "Đặt tên, lời chào và cách trợ lý trò chuyện với khách."],
  ["02", "Thêm tài liệu", "Tải bảng giá, thông tin sản phẩm và chờ tài liệu được duyệt."],
  ["03", "Đưa lên website", "Sao chép đoạn mã nhúng, thử chat và theo dõi hội thoại."],
];

export function HomePage() {
  const plans = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => api<PublicPlan[]>("/public/plans"),
  });
  const starterPrice = plans.data?.find((plan) => plan.code === "C1000")?.price_vnd;

  return (
    <div className="marketing-shell min-h-[100dvh]">
      <PublicNav />
      <main>
        <section className="marketing-hero">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16 lg:py-20">
            <div>
              <p className="section-eyebrow">{siteConfig.tagline}</p>
              <h1 className="marketing-slogan">
                {siteConfig.slogan}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-700">
                Tạo chatbot tư vấn bán hàng, tải thông tin sản phẩm và nhúng vào website.
                Mọi việc từ quản lý tài liệu đến xem hội thoại đều nằm trong một nơi.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/register" className="btn-swiss-primary">Bắt đầu miễn phí</Link>
                <a href="#how-it-works" className="btn-swiss-secondary">Xem cách hoạt động</a>
              </div>
              <p className="mt-5 text-sm text-slate-600">Miễn phí 1 chatbot và 20 lượt chat để bắt đầu.</p>
            </div>
            <div className="marketing-preview">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="section-eyebrow">Từ tài liệu đến câu trả lời</p>
                <h2 className="mt-2 text-xl font-semibold">Đưa chatbot vào website của bạn</h2>
              </div>
              <ol className="divide-y divide-slate-200 px-6">
                {steps.map(([number, title, description]) => <li key={number} className="flex gap-4 py-6"><span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand-soft text-sm font-semibold text-brand">{number}</span><div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div></li>)}
              </ol>
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-600">Bạn kiểm soát nội dung, lượt chat và thời điểm đưa trợ lý lên website.</div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="steps-heading">
          <p className="section-eyebrow">Bắt đầu sử dụng</p>
          <h2 id="steps-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Ba bước đơn giản</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Không cần thiết kế lại website. Bạn chỉ cần chuẩn bị nội dung sản phẩm và thêm đoạn mã nhúng.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(([number, title, description]) => (
              <article key={number} className="marketing-step">
                <span className="text-sm font-bold text-blue-700">{number}</span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="section-eyebrow">Quản lý trong một nơi</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Đủ thông tin để làm việc mỗi ngày</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="border-l-2 border-blue-600 pl-4">
                <h3 className="font-semibold text-slate-900">Kiểm soát tài liệu</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">Theo dõi trạng thái duyệt trước khi chatbot dùng nội dung để trả lời.</p>
              </div>
              <div className="border-l-2 border-blue-600 pl-4">
                <h3 className="font-semibold text-slate-900">Thử trước khi nhúng</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">Đặt câu hỏi như khách truy cập để kiểm tra câu trả lời.</p>
              </div>
              <div className="border-l-2 border-blue-600 pl-4">
                <h3 className="font-semibold text-slate-900">Theo dõi hội thoại</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">Xem khách đã hỏi gì và những người cần được liên hệ lại.</p>
              </div>
              <div className="border-l-2 border-blue-600 pl-4">
                <h3 className="font-semibold text-slate-900">Quản lý lượt dùng</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">Xem lượt còn lại và phân bổ lượt đã mua cho từng chatbot.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="pricing-heading">
          <p className="section-eyebrow">Gói sử dụng</p>
          <h2 id="pricing-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Bắt đầu miễn phí, mua thêm khi cần</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Bạn có thể mua thêm lượt chat hoặc vị trí chatbot. Giá đầy đủ của từng gói được hiển thị trong ứng dụng trước khi thanh toán.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="marketing-plan">
              <p className="text-sm font-semibold text-blue-700">Dùng thử</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-950">Miễn phí</h3>
              <p className="mt-4 text-sm leading-7 text-slate-700">1 chatbot · 20 lượt chat</p>
              <Link to="/register" className="btn-swiss-secondary mt-6">Tạo tài khoản</Link>
            </div>
            <div className="marketing-plan marketing-plan-featured">
              <p className="text-sm font-semibold text-blue-700">Mở rộng khi cần</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-950">Mua thêm lượt</h3>
              <p className="mt-4 text-sm leading-7 text-slate-700">
                Gói 1.000 lượt: <strong>{starterPrice == null ? "Xem giá trong ứng dụng" : `${starterPrice.toLocaleString("vi-VN")} ₫`}</strong>
              </p>
              <Link to="/register" className="btn-swiss-primary mt-6">Xem các gói</Link>
            </div>
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-600">Chỉ tài liệu đã được duyệt mới được chatbot sử dụng. Nếu chưa có thông tin sản phẩm, chatbot sẽ nói rõ với khách.</p>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-sm text-slate-600">
        <div className="mb-5 flex justify-center"><Brand /></div>
        <Link to="/privacy" className="hover:text-blue-700 hover:underline">Bảo mật</Link>
        <span className="mx-3">·</span>
        <Link to="/terms" className="hover:text-blue-700 hover:underline">Điều khoản</Link>
        <span className="mx-3">·</span>
        <Link to="/data-policy" className="hover:text-blue-700 hover:underline">Xử lý dữ liệu</Link>
      </footer>
    </div>
  );
}
