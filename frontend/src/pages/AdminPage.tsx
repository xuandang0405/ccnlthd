import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Bot, Building2, CheckCircle2, CircleDollarSign, FileCheck2,
  Headphones, LayoutDashboard, LogOut, Settings, ShieldCheck, Users, XCircle,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../services/api";
import type {
  AdminChatbot, AdminDocument, AdminOrganization, AdminPayment, AdminSummary,
  AdminUser, ModerationSettings, SupportTicket,
} from "../types";

type Section = "overview" | "organizations" | "users" | "chatbots" | "documents" | "tickets" | "payments" | "settings";
const navigation: Array<[LucideIcon, string, Section]> = [
  [LayoutDashboard, "Tổng quan", "overview"], [Building2, "Doanh nghiệp", "organizations"],
  [Users, "Người dùng", "users"], [Bot, "Chatbot", "chatbots"],
  [FileCheck2, "Duyệt tài liệu", "documents"], [Headphones, "Ticket hỗ trợ", "tickets"],
  [CircleDollarSign, "Thanh toán", "payments"], [Settings, "Cấu hình", "settings"],
];

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const colors = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-800", blue: "bg-blue-100 text-blue-700" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${colors[tone]}`}>{children}</span>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-black">{title}</h2></div>{children}</section>;
}

export function AdminPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const enabled = !!user?.is_super_admin;
  const summary = useQuery({ queryKey: ["admin-summary"], queryFn: () => api<AdminSummary>("/admin/summary"), enabled });
  const organizations = useQuery({ queryKey: ["admin-organizations"], queryFn: () => api<AdminOrganization[]>("/admin/organizations"), enabled: enabled && section === "organizations" });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users"), enabled: enabled && section === "users" });
  const chatbots = useQuery({ queryKey: ["admin-chatbots"], queryFn: () => api<AdminChatbot[]>("/admin/chatbots"), enabled: enabled && section === "chatbots" });
  const documents = useQuery({ queryKey: ["admin-documents"], queryFn: () => api<AdminDocument[]>("/admin/documents"), enabled: enabled && section === "documents" });
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api<SupportTicket[]>("/admin/tickets"), enabled: enabled && section === "tickets" });
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<AdminPayment[]>("/admin/payments"), enabled: enabled && section === "payments" });
  const moderation = useQuery({ queryKey: ["admin-moderation"], queryFn: () => api<ModerationSettings>("/admin/settings/moderation"), enabled: enabled && (section === "documents" || section === "settings") });
  const invalidate = (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const toggleOrganization = useMutation({ mutationFn: (item: AdminOrganization) => api<AdminOrganization>(`/admin/organizations/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-organizations", "admin-summary") });
  const toggleUser = useMutation({ mutationFn: (item: AdminUser) => api<AdminUser>(`/admin/users/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-users") });
  const toggleChatbot = useMutation({ mutationFn: (item: AdminChatbot) => api<AdminChatbot>(`/admin/chatbots/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-chatbots") });
  const reviewDocument = useMutation({ mutationFn: ({ id, approval_status }: { id: string; approval_status: string }) => api<AdminDocument>(`/admin/documents/${id}/approval`, { method: "PATCH", body: { approval_status } }), onSuccess: () => invalidate("admin-documents", "admin-summary") });
  const aiReview = useMutation({ mutationFn: (id: string) => api<AdminDocument>(`/admin/documents/${id}/ai-review`, { method: "POST" }), onSuccess: () => invalidate("admin-documents", "admin-summary") });
  const toggleModeration = useMutation({ mutationFn: (auto_review: boolean) => api<ModerationSettings>("/admin/settings/moderation", { method: "PUT", body: { auto_review } }), onSuccess: () => invalidate("admin-moderation") });
  const replyTicket = useMutation({ mutationFn: ({ id, message }: { id: string; message: string }) => api<SupportTicket>(`/admin/tickets/${id}/replies`, { method: "POST", body: { message } }), onSuccess: (_data, variables) => { setTicketReplies((old) => ({ ...old, [variables.id]: "" })); invalidate("admin-tickets", "admin-summary"); } });
  const ticketStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api<SupportTicket>(`/admin/tickets/${id}/status`, { method: "PATCH", body: { status } }), onSuccess: () => invalidate("admin-tickets", "admin-summary") });
  if (!user) return <Navigate to="/login" replace/>;
  if (!user.is_super_admin) return <Navigate to="/app" replace/>;

  const metricCards = summary.data ? [
    ["Doanh nghiệp", summary.data.organizations], ["Người dùng", summary.data.users],
    ["Chatbot", summary.data.chatbots], ["Hội thoại", summary.data.conversations],
    ["Lead", summary.data.leads], ["Chờ duyệt tài liệu", summary.data.documents_pending_review],
    ["Ticket đang mở", summary.data.tickets_open], ["Thanh toán chờ", summary.data.payments_pending],
  ] : [];

  return <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[270px_1fr]">
    <aside className="border-b border-slate-800 bg-slate-950 p-4 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex items-center justify-between lg:block"><div className="flex items-center gap-3 px-2 py-2"><span className="rounded-xl bg-blue-600 p-2"><ShieldCheck size={22}/></span><div><p className="font-black">AI Sales Admin</p><p className="text-xs text-slate-400">Quản trị toàn hệ thống</p></div></div><Link to="/app" className="rounded-lg bg-slate-800 p-2 lg:hidden"><ArrowLeft size={18}/></Link></div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:mt-8 lg:block lg:space-y-1">{navigation.map(([Icon, label, id]) => <button key={id} onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold lg:w-full ${section === id ? "bg-blue-600" : "text-slate-300 hover:bg-slate-800"}`}><Icon size={18}/>{label}</button>)}</nav>
      <div className="mt-5 hidden border-t border-slate-800 pt-5 lg:block"><Link to="/app" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"><ArrowLeft size={18}/>Dashboard khách hàng</Link><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"><LogOut size={18}/>Đăng xuất</button></div>
    </aside>
    <main className="p-5 lg:p-8"><div className="mx-auto max-w-7xl"><header className="mb-7"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Control Center</p><h1 className="mt-2 text-3xl font-black text-slate-950">{navigation.find(([, , id]) => id === section)?.[1]}</h1><p className="mt-1 text-slate-600">Theo dõi, kiểm duyệt và hỗ trợ tất cả khách hàng trên nền tảng.</p></header>
      {summary.isError && <p className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{summary.error.message}</p>}
      {section === "overview" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black">{value}</p></article>)}</div>}
      {section === "organizations" && <Panel title="Toàn bộ doanh nghiệp">{organizations.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-5 last:border-0"><div><p className="font-black">{item.name}</p><p className="text-sm text-slate-500">{item.slug} · {new Date(item.created_at).toLocaleDateString("vi-VN")}</p></div><button onClick={() => toggleOrganization.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Vô hiệu hóa" : "Kích hoạt"}</button></div>)}</Panel>}
      {section === "users" && <Panel title="Tài khoản người dùng">{users.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-5 last:border-0"><div><div className="flex items-center gap-2"><p className="font-black">{item.full_name}</p>{item.is_super_admin && <Badge tone="blue">ADMIN</Badge>}</div><p className="text-sm text-slate-500">{item.email} · {item.organizations.join(", ")}</p></div><button disabled={item.id === user.id} onClick={() => toggleUser.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40 ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Khóa" : "Mở khóa"}</button></div>)}</Panel>}
      {section === "chatbots" && <Panel title="Chatbot của tất cả khách hàng">{chatbots.data?.map((item) => <div key={item.id} className="grid gap-3 border-b p-5 last:border-0 md:grid-cols-[1fr_auto_auto]"><div><p className="font-black">{item.name}</p><p className="text-sm text-slate-500">{item.organization_name} · ID {item.public_id}</p></div><div className="text-sm"><b>{item.credit_balance.toLocaleString("vi-VN")}</b> lượt còn · <b>{item.usage_count.toLocaleString("vi-VN")}</b> đã dùng</div><button onClick={() => toggleChatbot.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Tắt chatbot" : "Bật chatbot"}</button></div>)}</Panel>}
      {section === "documents" && <DocumentsPanel documents={documents.data} moderation={moderation.data} onToggleModeration={(value) => toggleModeration.mutate(value)} onAiReview={(id) => aiReview.mutate(id)} onReview={(id, approval_status) => reviewDocument.mutate({ id, approval_status })}/>}
      {section === "tickets" && <TicketsPanel tickets={tickets.data} replies={ticketReplies} onReplyChange={(id, value) => setTicketReplies((old) => ({ ...old, [id]: value }))} onReply={(id, message) => replyTicket.mutate({ id, message })} onStatus={(id, status) => ticketStatus.mutate({ id, status })}/>}
      {section === "payments" && <Panel title="Lịch sử thanh toán">{payments.data?.map((item) => <div key={item.id} className="grid gap-2 border-b p-5 last:border-0 md:grid-cols-[1fr_1fr_auto_auto]"><div><p className="font-black">{item.order_code}</p><p className="text-sm text-slate-500">{item.organization_name}</p></div><p>{item.product_name}</p><b>{item.amount.toLocaleString("vi-VN")} ₫</b><Badge tone={item.status === "SUCCESS" ? "green" : item.status === "PENDING" ? "amber" : "red"}>{item.status}</Badge></div>)}</Panel>}
      {section === "settings" && <Panel title="Cấu hình kiểm duyệt"><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-black">Tự động duyệt tài liệu</p><p className="mt-1 text-sm text-slate-500">Khi tắt, mọi tài liệu xử lý xong đều phải được Admin duyệt tay.</p></div><button onClick={() => toggleModeration.mutate(!(moderation.data?.auto_review ?? true))} className={`rounded-full px-5 py-2 font-black ${(moderation.data?.auto_review ?? true) ? "bg-emerald-600 text-white" : "bg-slate-300"}`}>{(moderation.data?.auto_review ?? true) ? "BẬT" : "TẮT"}</button></div></Panel>}
    </div></main>
  </div>;
}

function DocumentsPanel({ documents, moderation, onToggleModeration, onAiReview, onReview }: { documents?: AdminDocument[]; moderation?: ModerationSettings; onToggleModeration: (value: boolean) => void; onAiReview: (id: string) => void; onReview: (id: string, status: string) => void }) {
  return <div className="space-y-5"><section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"><div><h2 className="font-black text-blue-950">Duyệt tự động bằng AI</h2><p className="mt-1 text-sm text-blue-800">Kiểm tra tín hiệu sản phẩm, cột giá và giá trị tiền. Không đạt sẽ chuyển sang chờ duyệt tay.</p></div><button onClick={() => onToggleModeration(!(moderation?.auto_review ?? true))} className={`rounded-full px-5 py-2 font-black ${(moderation?.auto_review ?? true) ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800"}`}>{(moderation?.auto_review ?? true) ? "Đang bật" : "Đang tắt"}</button></section><Panel title="Kho tài liệu toàn hệ thống">{documents?.map((item) => <div key={item.id} className="border-b p-5 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{item.original_name}</p><p className="text-sm text-slate-500">{item.organization_name} · {(item.size_bytes / 1024).toFixed(1)} KB</p></div><Badge tone={item.approval_status === "APPROVED" ? "green" : item.approval_status === "REJECTED" ? "red" : "amber"}>{item.approval_status}</Badge></div>{item.ai_review && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>AI score: {item.ai_review.score}/100</b><p className="mt-1 text-slate-600">{item.ai_review.summary}</p>{item.ai_review.issues?.length > 0 && <p className="mt-1 text-red-600">{item.ai_review.issues.join(" · ")}</p>}</div>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={() => onAiReview(item.id)} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">AI kiểm tra</button><button onClick={() => onReview(item.id, "APPROVED")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={15}/>Duyệt</button><button onClick={() => onReview(item.id, "REJECTED")} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><XCircle size={15}/>Từ chối</button></div></div>)}</Panel></div>;
}

function TicketsPanel({ tickets, replies, onReplyChange, onReply, onStatus }: { tickets?: SupportTicket[]; replies: Record<string, string>; onReplyChange: (id: string, value: string) => void; onReply: (id: string, message: string) => void; onStatus: (id: string, status: string) => void }) {
  if (tickets?.length === 0) return <Panel title="Ticket hỗ trợ"><p className="p-8 text-center text-slate-500">Chưa có ticket.</p></Panel>;
  return <div className="space-y-4">{tickets?.map((ticket) => <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black">{ticket.subject}</h2><p className="text-sm text-slate-500">{ticket.organization_name} · {new Date(ticket.updated_at).toLocaleString("vi-VN")}</p></div><select value={ticket.status} onChange={(event) => onStatus(ticket.id, event.target.value)} className="rounded-lg border border-slate-300 p-2 text-sm font-bold"><option value="OPEN">Mới</option><option value="IN_PROGRESS">Đang hỗ trợ</option><option value="RESOLVED">Đã giải quyết</option><option value="CLOSED">Đã đóng</option></select></div><div className="mt-4 space-y-2">{ticket.messages.map((message, index) => <div key={index} className={`rounded-xl p-3 text-sm ${message.sender_type === "ADMIN" ? "ml-8 bg-blue-50" : "mr-8 bg-slate-100"}`}><b>{message.sender_name}</b><p className="mt-1 whitespace-pre-wrap">{message.message}</p></div>)}</div><div className="mt-4 flex gap-2"><input value={replies[ticket.id] ?? ""} onChange={(event) => onReplyChange(ticket.id, event.target.value)} placeholder="Phản hồi khách hàng..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2"/><button disabled={!replies[ticket.id]?.trim()} onClick={() => onReply(ticket.id, replies[ticket.id].trim())} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40">Gửi</button></div></article>)}</div>;
}
