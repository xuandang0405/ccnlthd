import { ArrowRight, Bot, FileText, MessageSquareText, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";
import { api } from "../services/api";
import type { PublicPlan } from "../types";

const features = [
  [Bot, "Trợ lý AI theo dữ liệu", "Trả lời dựa trên tài liệu được doanh nghiệp cho phép và nói rõ khi chưa có thông tin."],
  [FileText, "Quản lý tài liệu", "Xử lý PDF, DOCX và XLSX theo từng doanh nghiệp, có trạng thái và khả năng truy vết."],
  [Users, "Thu thập khách hàng", "Ghi nhận thông tin liên hệ do khách tự nguyện cung cấp và quản lý theo quy trình bán hàng."],
  [MessageSquareText, "Widget nhúng", "Đưa cửa sổ chat lên website mà không chia sẻ khóa Gemini hay quyền quản trị."],
  [ShieldCheck, "Cách ly dữ liệu", "Mọi tài nguyên được kiểm tra tenant và quyền truy cập ở Backend."],
  [Sparkles, "Vận hành tập trung", "Theo dõi sử dụng, hội thoại, tài liệu và trạng thái dịch vụ trong một dashboard."],
];

export function HomePage() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api<PublicPlan[]>("/public/plans") });
  const starterPrice = plans.data?.find((plan) => plan.code === "C1000")?.price_vnd;
  return <div className="min-h-screen bg-[#f7f9fd]">
    <PublicNav />
    <main>
      <section className="relative overflow-hidden px-5 pb-24 pt-20 lg:px-8 lg:pt-28">
        <div className="absolute inset-x-0 top-0 -z-0 h-[540px] bg-[radial-gradient(circle_at_20%_10%,#dbeafe_0,transparent_38%),radial-gradient(circle_at_80%_10%,#ede9fe_0,transparent_35%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">Trợ lý bán hàng dành cho doanh nghiệp Việt</span>
            <h1 className="text-balance mt-6 text-5xl font-black tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">Biến dữ liệu sản phẩm thành cuộc trò chuyện hữu ích.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Tạo trợ lý AI, cung cấp thông tin sản phẩm, hỗ trợ khách hàng và ghi nhận khách hàng tiềm năng — trên chính website của bạn.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">Bắt đầu miễn phí <ArrowRight size={18}/></Link>
              <a href="#features" className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-bold text-slate-700 hover:border-blue-400">Xem tính năng</a>
            </div>
          </div>
          <div className="shadow-soft rounded-[2rem] border border-white bg-white p-4">
            <div className="rounded-[1.5rem] bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-3 border-b border-slate-700 pb-4"><span className="rounded-full bg-blue-500 p-2"><Bot size={20}/></span><div><p className="font-bold">Trợ lý sản phẩm</p><p className="text-xs text-emerald-400">Đang hoạt động</p></div></div>
              <div className="space-y-4 py-6 text-sm"><div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800 p-4">Xin chào! Bạn muốn tìm hiểu sản phẩm nào?</div><div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 p-4">Cho tôi biết giá sản phẩm A.</div><div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-800 p-4">Tôi sẽ tra cứu tài liệu doanh nghiệp đã cung cấp trước khi trả lời.</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-white px-5 py-24 lg:px-8"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="font-bold text-blue-700">Một nền tảng, toàn bộ luồng chăm sóc</p><h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">Được thiết kế để vận hành, không chỉ để trình diễn.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, title, text]) => <article key={title as string} className="rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"><span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-700"><Icon /></span><h3 className="mt-5 text-lg font-bold text-slate-950">{title as string}</h3><p className="mt-2 leading-7 text-slate-600">{text as string}</p></article>)}</div></div></section>

      <section id="how-it-works" className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="font-bold text-blue-700">Ba bước để bắt đầu</p><h2 className="mt-3 text-4xl font-black text-slate-950">Từ tài liệu thành trợ lý trên website.</h2></div><div className="mt-12 grid gap-6 md:grid-cols-3">{[["01", "Tạo trợ lý", "Đặt tên, lời chào, phong cách và màu nhận diện."], ["02", "Cung cấp dữ liệu", "Tải tài liệu hợp lệ và chỉ định nguồn cho chatbot."], ["03", "Nhúng và vận hành", "Dán một đoạn script, theo dõi hội thoại và xử lý lead."]].map(([number, title, text]) => <article key={number} className="rounded-3xl bg-slate-950 p-7 text-white"><span className="text-sm font-black text-blue-400">{number}</span><h3 className="mt-5 text-xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-300">{text}</p></article>)}</div></div></section>

      <section id="pricing" className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-5xl text-center"><h2 className="text-4xl font-black text-slate-950">Bắt đầu với nhu cầu thực tế</h2><p className="mt-4 text-slate-600">Dùng thử miễn phí, sau đó chỉ mua đúng số lượt và số chatbot cần dùng.</p><div className="mt-12 grid gap-6 text-left md:grid-cols-2"><article className="rounded-3xl border border-slate-200 bg-white p-8"><p className="font-bold text-blue-700">FREE</p><h3 className="mt-3 text-3xl font-black">20 lượt chat + 1 chatbot</h3><p className="mt-3 text-slate-600">20 lượt dùng thử cho doanh nghiệp mới, không yêu cầu thẻ.</p><Link to="/register" className="mt-8 block rounded-xl bg-slate-950 px-5 py-3 text-center font-bold text-white">Bắt đầu miễn phí</Link></article><article className="rounded-3xl border-2 border-blue-600 bg-blue-600 p-8 text-white"><p className="font-bold text-blue-100">TRẢ THEO NHU CẦU</p><h3 className="mt-3 text-3xl font-black">{starterPrice ? `${starterPrice.toLocaleString("vi-VN")} ₫ / 1.000 lượt` : plans.isLoading ? "Đang tải giá..." : "10 gói lượt linh hoạt"}</h3><p className="mt-3 text-blue-100">Lượt đã mua không hết hạn. Mua thêm chatbot với giá 200.000đ/con.</p><Link to="/register" className="mt-8 block rounded-xl bg-white px-5 py-3 text-center font-bold text-blue-700">Tạo tài khoản</Link></article></div></div></section>

      <section id="faq" className="bg-white px-5 py-24 lg:px-8"><div className="mx-auto max-w-4xl"><div className="text-center"><p className="font-bold text-blue-700">Câu hỏi thường gặp</p><h2 className="mt-3 text-4xl font-black">Rõ ràng trước khi triển khai.</h2></div><div className="mt-10 space-y-4">{[["AI có tự bịa giá sản phẩm không?", "Hệ thống yêu cầu AI ưu tiên dữ liệu doanh nghiệp và nói rõ khi không có thông tin chính xác."], ["Dữ liệu của các doanh nghiệp có dùng chung không?", "Không. Backend kiểm tra membership và organization cho từng tài nguyên, kể cả nguồn đưa vào AI."], ["Khách truy cập có cần tài khoản không?", "Không. Widget tạo visitor session riêng, không sử dụng JWT hay quyền của chủ doanh nghiệp."], ["Có thể chạy trên máy cá nhân không?", "Có, sau khi xác nhận Docker, domain, IP public hoặc CGNAT, firewall, HTTPS và cơ chế backup thực tế."]].map(([question, answer]) => <details key={question} className="rounded-2xl border border-slate-200 p-5"><summary className="cursor-pointer font-bold text-slate-950">{question}</summary><p className="mt-3 leading-7 text-slate-600">{answer}</p></details>)}</div><div className="mt-12 rounded-3xl bg-blue-50 p-8 text-center"><h3 className="text-2xl font-black">Muốn thử với dữ liệu doanh nghiệp của bạn?</h3><p className="mt-2 text-slate-600">Tạo workspace miễn phí và bắt đầu với 20 lượt chat mỗi ngày.</p><Link to="/register" className="mt-6 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">Bắt đầu ngay</Link></div></div></section>
    </main>
    <footer className="border-t border-slate-200 bg-white px-5 py-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-slate-500 md:flex-row"><p>© 2026 AI Sales Assistant</p><div className="flex gap-5"><Link to="/privacy">Quyền riêng tư</Link><Link to="/terms">Điều khoản</Link><Link to="/data-policy">Xử lý dữ liệu</Link></div></div></footer>
  </div>;
}
