import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Check, Copy, CreditCard, ExternalLink, FileText, LayoutDashboard, LogOut,
  MessageSquareText, Plus, QrCode, Settings, Trash2, Upload, Users, type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, uploadApi } from "../services/api";
import type {
  Chatbot, Conversation, DashboardSummary, DocumentItem, Lead, Page, PaymentOrder,
  PaymentOrderStatus,
} from "../types";

type View = "overview" | "chatbots" | "documents" | "conversations" | "leads" | "payment" | "settings";
type TelegramStatus = { configured: boolean; enabled: boolean; chat_id_hint: string | null; verified_at: string | null };
const nav: Array<[LucideIcon, string, View]> = [
  [LayoutDashboard, "Tổng quan", "overview"], [Bot, "Trợ lý AI", "chatbots"],
  [FileText, "Tài liệu", "documents"], [MessageSquareText, "Cuộc trò chuyện", "conversations"],
  [Users, "Khách hàng tiềm năng", "leads"], [CreditCard, "Gói & thanh toán", "payment"],
  [Settings, "Cài đặt", "settings"],
];

function StateMessage({ children }: { children: ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{children}</div>;
}

function PaymentPanel() {
  const [copied, setCopied] = useState(false);
  const payment = useMutation({
    mutationFn: () => api<PaymentOrder>("/payments/orders/pro", { method: "POST" }),
    onSuccess: () => setCopied(false),
  });
  const paymentStatus = useQuery({
    queryKey: ["payment-order", payment.data?.id],
    queryFn: () => api<PaymentOrderStatus>(`/payments/orders/${payment.data?.id}`),
    enabled: !!payment.data?.id,
    refetchInterval: (query) => query.state.data?.status === "PENDING" ? 5000 : false,
  });
  const status = paymentStatus.data?.status ?? payment.data?.status;

  async function copyTransferContent() {
    if (!payment.data) return;
    await navigator.clipboard.writeText(payment.data.transfer_content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <section>
    <h2 className="text-3xl font-black">Gói & thanh toán</h2>
    <p className="mt-2 text-slate-600">Quét VietQR để chuyển đúng số tiền và nội dung của đơn.</p>
    <article className="mt-6 max-w-4xl rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-xl font-black">Nâng cấp Pro</h3><p className="mt-2 text-slate-600">Bỏ quota Free; vẫn áp dụng giới hạn chống lạm dụng.</p></div>
        <button onClick={() => payment.mutate()} disabled={payment.isPending} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50"><QrCode size={18}/>{payment.isPending ? "Đang tạo QR..." : payment.data ? "Tạo QR mới" : "Tạo QR thanh toán"}</button>
      </div>
      {payment.isError && <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{payment.error.message}</p>}
      {payment.data && <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <img src={payment.data.qr_code_url} alt={`VietQR cho đơn ${payment.data.order_code}`} className="mx-auto w-full rounded-xl"/>
          <a href={payment.data.qr_code_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"><ExternalLink size={16}/>Mở QR kích thước đầy đủ</a>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5">
          {status === "SUCCESS" ? <div className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-100 p-4 font-bold text-emerald-800"><Check size={22}/>Thanh toán thành công, gói Pro đã được kích hoạt.</div> : <div className="mb-5 rounded-xl bg-amber-100 p-4 text-sm font-semibold text-amber-900">Đang chờ thanh toán. Trạng thái được kiểm tra tự động mỗi 5 giây.</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <p><span className="block text-xs text-slate-500">Ngân hàng</span><b>{payment.data.bank_code}</b></p>
            <p><span className="block text-xs text-slate-500">Số tài khoản</span><b>{payment.data.account_number}</b></p>
            <p><span className="block text-xs text-slate-500">Chủ tài khoản</span><b>{payment.data.account_name}</b></p>
            <p><span className="block text-xs text-slate-500">Số tiền</span><b className="text-lg text-blue-700">{payment.data.amount.toLocaleString("vi-VN")} ₫</b></p>
          </div>
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><span className="block text-xs text-blue-700">Nội dung chuyển khoản bắt buộc</span><div className="mt-2 flex items-center justify-between gap-3"><b className="break-all text-lg text-blue-800">{payment.data.transfer_content}</b><button onClick={copyTransferContent} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow-sm">{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Đã chép" : "Sao chép"}</button></div></div>
          {payment.data.expires_at && <p className="mt-4 text-xs text-slate-500">Đơn có hiệu lực đến {new Date(payment.data.expires_at).toLocaleString("vi-VN")}.</p>}
        </div>
      </div>}
    </article>
  </section>;
}

export function DashboardPage() {
  const { user, organizationId, logout } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("overview");
  const [name, setName] = useState("");
  const [telegramChatId, setTelegramChatId] = useState(""); const [telegramCode, setTelegramCode] = useState("");
  const summary = useQuery({ queryKey: ["dashboard", organizationId], queryFn: () => api<DashboardSummary>("/dashboard/summary"), enabled: !!organizationId });
  const chatbots = useQuery({ queryKey: ["chatbots", organizationId], queryFn: () => api<Chatbot[]>("/chatbots"), enabled: !!organizationId });
  const documents = useQuery({ queryKey: ["documents", organizationId], queryFn: () => api<DocumentItem[]>("/documents"), enabled: !!organizationId && view === "documents", refetchInterval: (query) => query.state.data?.some((item) => item.status === "UPLOADED" || item.status === "PROCESSING") ? 3000 : false });
  const conversations = useQuery({ queryKey: ["conversations", organizationId], queryFn: () => api<Page<Conversation>>("/conversations"), enabled: !!organizationId && view === "conversations" });
  const leads = useQuery({ queryKey: ["leads", organizationId], queryFn: () => api<Page<Lead>>("/leads"), enabled: !!organizationId && view === "leads" });
  const telegramStatus = useQuery({ queryKey: ["telegram", organizationId], queryFn: () => api<TelegramStatus>("/telegram/status"), enabled: !!organizationId && view === "settings" });
  const create = useMutation({ mutationFn: (chatbotName: string) => api<Chatbot>("/chatbots", { method: "POST", body: { name: chatbotName } }), onSuccess: () => { setName(""); queryClient.invalidateQueries({ queryKey: ["chatbots", organizationId] }); queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] }); } });
  const upload = useMutation({ mutationFn: (file: File) => { const form = new FormData(); form.append("file", file); return uploadApi<DocumentItem>("/documents", form); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["documents", organizationId] }); queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] }); } });
  const deleteDocument = useMutation({ mutationFn: (id: string) => api<void>(`/documents/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["documents", organizationId] }); queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] }); } });
  const updateLead = useMutation({ mutationFn: ({ id, status }: { id: string; status: Lead["status"] }) => api<Lead>(`/leads/${id}`, { method: "PATCH", body: { status } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads", organizationId] }) });
  const telegramChallenge = useMutation({ mutationFn: () => api<{ detail: string }>("/telegram/challenge", { method: "POST", body: { chat_id: telegramChatId } }) });
  const telegramConfirm = useMutation({ mutationFn: () => api<TelegramStatus>("/telegram/confirm", { method: "POST", body: { code: telegramCode } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telegram", organizationId] }) });
  if (!user || !organizationId) return <Navigate to="/login" replace/>;

  const metrics: Array<[LucideIcon, string, number]> = summary.data ? [
    [Bot, "Chatbot", summary.data.chatbot_count], [MessageSquareText, "Cuộc trò chuyện", summary.data.conversation_count],
    [Users, "Lead mới", summary.data.new_lead_count], [FileText, "Tài liệu", summary.data.document_count],
  ] : [];

  return <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="hidden border-r border-slate-200 bg-slate-950 p-5 text-white lg:flex lg:flex-col">
      <div className="flex items-center gap-2 px-2 py-3 font-bold"><span className="rounded-xl bg-blue-600 p-2"><Bot size={18}/></span>AI Sales</div>{user.is_super_admin && <Link to="/admin" className="mt-3 rounded-xl border border-slate-700 px-3 py-2 text-center text-sm font-bold text-blue-300">Quản trị hệ thống</Link>}
      <nav className="mt-8 space-y-1">{nav.map(([Icon, label, id]) => <button key={id} onClick={() => setView(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${view === id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}><Icon size={18}/>{label}</button>)}</nav>
      <button onClick={logout} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"><LogOut size={18}/>Đăng xuất</button>
    </aside>
    <main><header className="border-b border-slate-200 bg-white px-5 py-5 lg:px-10"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Không gian làm việc</p><h1 className="mt-1 text-xl font-black text-slate-950">{user.organizations.find((item) => item.id === organizationId)?.name}</h1></div><button onClick={logout} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold lg:hidden">Đăng xuất</button><span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold lg:block">{user.full_name}</span></div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">{nav.map(([Icon, label, id]) => <button key={id} onClick={() => setView(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${view === id ? "bg-blue-600 text-white" : "bg-slate-100"}`}><Icon size={16}/>{label}</button>)}</nav></header>
      <div className="p-5 lg:p-10">
        {view === "overview" && <section><h2 className="text-3xl font-black">Tổng quan</h2><p className="mt-2 text-slate-600">Dữ liệu trực tiếp từ hệ thống của doanh nghiệp.</p>{summary.isLoading && <div className="mt-8 animate-pulse rounded-2xl bg-slate-200 p-16"/>}{summary.isError && <StateMessage>Không tải được dashboard: {summary.error.message}</StateMessage>}{summary.data && <><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([Icon, label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon size={20}/></span><span className="text-3xl font-black">{value}</span></div><p className="mt-5 text-sm font-semibold text-slate-500">{label}</p></article>)}</div><article className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Gói hiện tại</p><div className="mt-1 flex flex-wrap items-end justify-between gap-3"><h3 className="text-2xl font-black">{summary.data.current_plan}</h3><p className="font-bold">{summary.data.daily_used} / {summary.data.daily_limit ?? "Không áp dụng quota Free"} lượt hôm nay</p></div></article></>}</section>}
        {view === "chatbots" && <section><h2 className="text-3xl font-black">Trợ lý AI</h2><p className="mt-2 text-slate-600">Tạo chatbot và lấy ID công khai để nhúng widget.</p><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(name.trim()); }} className="mt-6 flex max-w-xl gap-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên chatbot mới" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3"/><button disabled={create.isPending || name.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"><Plus size={18}/>Tạo</button></form>{create.isError && <p className="mt-3 text-red-600">{create.error.message}</p>}{chatbots.data?.length === 0 && <StateMessage>Chưa có chatbot.</StateMessage>}<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{chatbots.data?.map((bot) => <article key={bot.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between"><span className="rounded-xl p-3 text-white" style={{ backgroundColor: bot.primary_color }}><Bot/></span><span className="text-xs font-bold text-emerald-700">{bot.is_active ? "Đang bật" : "Đã tắt"}</span></div><h3 className="mt-4 font-bold">{bot.name}</h3><p className="mt-2 text-sm text-slate-500">{bot.greeting}</p><code className="mt-4 block overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200">{`<script src="${location.origin}/widget.js" data-chatbot-id="${bot.public_id}" async></script>`}</code></article>)}</div></section>}
        {view === "documents" && <section><h2 className="text-3xl font-black">Tài liệu</h2><p className="mt-2 text-slate-600">PDF, DOCX hoặc XLSX, tối đa 10 MB.</p><label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"><Upload size={18}/>{upload.isPending ? "Đang tải..." : "Chọn tệp"}<input type="file" accept=".pdf,.docx,.xlsx" className="hidden" disabled={upload.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }}/></label>{upload.isError && <p className="mt-3 text-red-600">{upload.error.message}</p>}{deleteDocument.isError && <p className="mt-3 text-red-600">{deleteDocument.error.message}</p>}{documents.data?.length === 0 && <StateMessage>Chưa có tài liệu.</StateMessage>}<div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">{documents.data?.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0"><div><p className="font-semibold">{doc.original_name}</p><p className="text-sm text-slate-500">{(doc.size_bytes / 1024).toFixed(1)} KB</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${doc.status === "DONE" ? "bg-emerald-50 text-emerald-700" : doc.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{doc.status}</span><button type="button" title={`Xóa ${doc.original_name}`} aria-label={`Xóa ${doc.original_name}`} disabled={deleteDocument.isPending && deleteDocument.variables === doc.id} onClick={() => { if (window.confirm(`Xóa tài liệu “${doc.original_name}”?`)) deleteDocument.mutate(doc.id); }} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"><Trash2 size={16}/>{deleteDocument.isPending && deleteDocument.variables === doc.id ? "Đang xóa..." : "Xóa"}</button></div></div>)}</div></section>}
        {view === "conversations" && <section><h2 className="text-3xl font-black">Cuộc trò chuyện</h2><p className="mt-2 text-slate-600">Lịch sử thực thuộc doanh nghiệp của bạn.</p>{conversations.data?.total === 0 && <StateMessage>Chưa có cuộc trò chuyện.</StateMessage>}<div className="mt-6 space-y-3">{conversations.data?.items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-3"><p className="font-mono text-sm">{item.id}</p><span className="text-xs font-bold text-emerald-700">{item.status}</span></div><p className="mt-2 text-sm text-slate-500">{new Date(item.created_at).toLocaleString("vi-VN")}</p></article>)}</div></section>}
        {view === "leads" && <section><h2 className="text-3xl font-black">Khách hàng tiềm năng</h2><p className="mt-2 text-slate-600">Thông tin khách tự nguyện cung cấp qua widget.</p>{leads.data?.total === 0 && <StateMessage>Chưa có lead.</StateMessage>}<div className="mt-6 grid gap-4 xl:grid-cols-2">{leads.data?.items.map((lead) => <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold">{lead.customer_name || "Khách chưa đặt tên"}</h3><p className="mt-1 text-sm text-slate-500">{lead.phone || lead.email}</p></div><select value={lead.status} onChange={(event) => updateLead.mutate({ id: lead.id, status: event.target.value as Lead["status"] })} className="rounded-lg border border-slate-300 p-2 text-sm"><option value="NEW">Mới</option><option value="CONTACTED">Đã liên hệ</option><option value="QUALIFIED">Tiềm năng</option><option value="CLOSED">Đã chốt</option><option value="LOST">Không thành công</option></select></div>{lead.intent_summary && <p className="mt-4 text-sm text-slate-600">{lead.intent_summary}</p>}</article>)}</div></section>}
        {view === "payment" && <PaymentPanel/>}
        {view === "settings" && <section><h2 className="text-3xl font-black">Cài đặt</h2><p className="mt-2 text-slate-600">Kết nối nơi nhận thông báo lead theo từng doanh nghiệp.</p><article className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-black">Telegram</h3><p className="mt-2 text-sm text-slate-600">Trạng thái: {telegramStatus.data?.enabled ? `Đã xác minh ${telegramStatus.data.chat_id_hint}` : "Chưa kết nối"}</p><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><input value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} placeholder="Telegram Chat ID" className="rounded-xl border border-slate-300 px-4 py-3"/><button onClick={() => telegramChallenge.mutate()} disabled={!telegramChatId.trim() || telegramChallenge.isPending} className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Gửi mã xác minh</button></div>{telegramChallenge.isSuccess && <p className="mt-3 text-sm text-emerald-700">Mã đã được gửi. Nhập mã nhận được bên dưới.</p>}<div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><input value={telegramCode} onChange={(event) => setTelegramCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Mã 6 chữ số" className="rounded-xl border border-slate-300 px-4 py-3"/><button onClick={() => telegramConfirm.mutate()} disabled={telegramCode.length !== 6 || telegramConfirm.isPending} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Xác nhận</button></div>{(telegramChallenge.isError || telegramConfirm.isError) && <p className="mt-3 text-sm text-red-600">{telegramChallenge.error?.message || telegramConfirm.error?.message}</p>}</article></section>}
      </div>
    </main>
  </div>;
}
