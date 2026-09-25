import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Bot, Building2, CheckCircle2, CircleDollarSign, FileCheck2,
  Headphones, LayoutDashboard, LogOut, Settings, ShieldCheck, Users, XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { TicketChat } from "../components/TicketChat";
import { api, uploadApi } from "../services/api";
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

const sectionCopy: Record<Section, string> = {
  overview: "Sức khỏe tổng thể của nền tảng và các việc đang chờ xử lý.",
  organizations: "Kích hoạt hoặc tạm ngưng quyền sử dụng của từng doanh nghiệp.",
  users: "Theo dõi, khóa và mở khóa tài khoản trên toàn hệ thống.",
  chatbots: "Quản lý trạng thái và số lượt còn lại của chatbot thuộc mọi khách hàng.",
  documents: "Kiểm tra nội dung, chạy AI đánh giá và duyệt tài liệu trước khi chatbot sử dụng.",
  tickets: "Tiếp nhận, phản hồi và cập nhật tiến độ hỗ trợ khách hàng.",
  payments: "Đối soát đơn hàng, gói lượt dùng và trạng thái thanh toán.",
  settings: "Cấu hình quy trình kiểm duyệt dùng chung cho toàn nền tảng.",
};

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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFiles, setTicketFiles] = useState<File[]>([]);
  const enabled = !!user?.is_super_admin;
  const summary = useQuery({ queryKey: ["admin-summary"], queryFn: () => api<AdminSummary>("/admin/summary"), enabled, refetchInterval: 10000 });
  const organizations = useQuery({ queryKey: ["admin-organizations"], queryFn: () => api<AdminOrganization[]>("/admin/organizations"), enabled: enabled && section === "organizations" });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users"), enabled: enabled && section === "users" });
  const chatbots = useQuery({ queryKey: ["admin-chatbots"], queryFn: () => api<AdminChatbot[]>("/admin/chatbots"), enabled: enabled && section === "chatbots" });
  const documents = useQuery({ queryKey: ["admin-documents"], queryFn: () => api<AdminDocument[]>("/admin/documents"), enabled: enabled && section === "documents" });
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api<SupportTicket[]>("/admin/tickets"), enabled: enabled && section === "tickets", refetchInterval: 5000 });
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<AdminPayment[]>("/admin/payments"), enabled: enabled && section === "payments" });
  const moderation = useQuery({ queryKey: ["admin-moderation"], queryFn: () => api<ModerationSettings>("/admin/settings/moderation"), enabled: enabled && (section === "documents" || section === "settings") });
  const invalidate = (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const toggleOrganization = useMutation({ mutationFn: (item: AdminOrganization) => api<AdminOrganization>(`/admin/organizations/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-organizations", "admin-summary") });
  const toggleUser = useMutation({ mutationFn: (item: AdminUser) => api<AdminUser>(`/admin/users/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-users") });
  const toggleChatbot = useMutation({ mutationFn: (item: AdminChatbot) => api<AdminChatbot>(`/admin/chatbots/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => invalidate("admin-chatbots") });
  const reviewDocument = useMutation({ mutationFn: ({ id, approval_status }: { id: string; approval_status: string }) => api<AdminDocument>(`/admin/documents/${id}/approval`, { method: "PATCH", body: { approval_status } }), onSuccess: () => invalidate("admin-documents", "admin-summary") });
  const aiReview = useMutation({ mutationFn: (id: string) => api<AdminDocument>(`/admin/documents/${id}/ai-review`, { method: "POST" }), onSuccess: () => invalidate("admin-documents", "admin-summary") });
  const toggleModeration = useMutation({ mutationFn: (auto_review: boolean) => api<ModerationSettings>("/admin/settings/moderation", { method: "PUT", body: { auto_review } }), onSuccess: () => invalidate("admin-moderation") });
  const replyTicket = useMutation({ mutationFn: async (ticket: SupportTicket) => { if (ticketFiles.length > 0) { const form = new FormData(); ticketFiles.forEach((file) => form.append("files", file)); form.append("message", ticketReply.trim()); return uploadApi<SupportTicket>(`/admin/tickets/${ticket.id}/attachments`, form); } return api<SupportTicket>(`/admin/tickets/${ticket.id}/replies`, { method: "POST", body: { message: ticketReply.trim() } }); }, onSuccess: () => { setTicketReply(""); setTicketFiles([]); invalidate("admin-tickets", "admin-summary"); } });
  const ticketStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api<SupportTicket>(`/admin/tickets/${id}/status`, { method: "PATCH", body: { status } }), onSuccess: () => invalidate("admin-tickets", "admin-summary") });
  const markTicketRead = useMutation({
    mutationFn: (id: string) => api<SupportTicket>(`/admin/tickets/${id}/read`, { method: "PATCH" }),
    onMutate: (id) => queryClient.setQueryData<SupportTicket[]>(["admin-tickets"], (current) => current?.map((ticket) => ticket.id === id ? { ...ticket, admin_unread_count: 0 } : ticket)),
    onSuccess: () => invalidate("admin-tickets", "admin-summary"),
  });
  useEffect(() => {
    if (section !== "tickets" || !tickets.data?.length || markTicketRead.isPending) return;
    const selected = tickets.data.find((ticket) => ticket.id === selectedTicketId) ?? tickets.data[0];
    if (selectedTicketId !== selected.id) setSelectedTicketId(selected.id);
    if (selected.admin_unread_count > 0) markTicketRead.mutate(selected.id);
  }, [section, selectedTicketId, tickets.data, markTicketRead]);
  if (!user) return <Navigate to="/login" replace/>;
  if (!user.is_super_admin) return <Navigate to="/app" replace/>;

  const metricCards = summary.data ? [
    ["Doanh nghiệp", summary.data.organizations], ["Người dùng", summary.data.users],
    ["Chatbot", summary.data.chatbots], ["Hội thoại", summary.data.conversations],
    ["Lead", summary.data.leads], ["Chờ duyệt tài liệu", summary.data.documents_pending_review],
    ["Ticket đang mở", summary.data.tickets_open], ["Thanh toán chờ", summary.data.payments_pending],
  ] : [];
  const activeQuery = section === "overview" ? summary : section === "organizations" ? organizations
    : section === "users" ? users : section === "chatbots" ? chatbots
    : section === "documents" ? documents : section === "tickets" ? tickets
    : section === "payments" ? payments : moderation;
  const actionError = [toggleOrganization, toggleUser, toggleChatbot, reviewDocument, aiReview, toggleModeration, replyTicket, ticketStatus]
    .find((mutation) => mutation.isError)?.error;

  return <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[270px_1fr]">
    <aside className="border-b border-slate-800 bg-slate-950 p-4 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex items-center justify-between lg:block"><div className="flex items-center gap-3 px-2 py-2"><span className="rounded-xl bg-blue-600 p-2"><ShieldCheck size={22}/></span><div><p className="font-black">AI Sales Admin</p><p className="text-xs text-slate-400">Quản trị toàn hệ thống</p></div></div><Link to="/app" className="rounded-lg bg-slate-800 p-2 lg:hidden"><ArrowLeft size={18}/></Link></div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:mt-8 lg:block lg:space-y-1">{navigation.map(([Icon, label, id]) => <button key={id} onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold lg:w-full ${section === id ? "bg-blue-600" : "text-slate-300 hover:bg-slate-800"}`}><Icon size={18}/><span className="flex-1">{label}</span>{id === "tickets" && (summary.data?.tickets_unread ?? 0) > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{summary.data?.tickets_unread}</span>}</button>)}</nav>
      <div className="mt-5 hidden border-t border-slate-800 pt-5 lg:block"><Link to="/app" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"><ArrowLeft size={18}/>Dashboard khách hàng</Link><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"><LogOut size={18}/>Đăng xuất</button></div>
    </aside>
    <main className="p-5 lg:p-8"><div className="mx-auto max-w-7xl"><header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Khu quản trị riêng</p><h1 className="mt-2 text-3xl font-black text-slate-950">{navigation.find(([, , id]) => id === section)?.[1]}</h1><p className="mt-2 max-w-3xl text-slate-600">{sectionCopy[section]}</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-sm"><p className="font-black text-slate-900">{user.full_name}</p><p className="text-slate-500">{summary.isSuccess ? "● Server đang kết nối" : "Đang kiểm tra server..."}</p></div></header>
      {activeQuery.isLoading && <p role="status" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-800">Đang tải dữ liệu quản trị...</p>}
      {activeQuery.isError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p className="font-black">Không tải được dữ liệu</p><p className="mt-1 text-sm">{activeQuery.error.message}</p><button onClick={() => activeQuery.refetch()} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white">Thử lại</button></div>}
      {actionError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><b>Thao tác chưa thành công:</b> {actionError.message}</div>}
      {section === "overview" && !summary.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black">{value}</p></article>)}</div>}
      {section === "organizations" && <Panel title="Toàn bộ doanh nghiệp">{organizations.data?.length === 0 && <EmptyState label="Chưa có doanh nghiệp."/>}{organizations.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-5 last:border-0"><div><p className="font-black">{item.name}</p><p className="text-sm text-slate-500">{item.slug} · {new Date(item.created_at).toLocaleDateString("vi-VN")}</p></div><button disabled={toggleOrganization.isPending} onClick={() => toggleOrganization.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40 ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Vô hiệu hóa" : "Kích hoạt"}</button></div>)}</Panel>}
      {section === "users" && <Panel title="Tài khoản người dùng">{users.data?.length === 0 && <EmptyState label="Chưa có người dùng."/>}{users.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-5 last:border-0"><div><div className="flex items-center gap-2"><p className="font-black">{item.full_name}</p>{item.is_super_admin && <Badge tone="blue">ADMIN</Badge>}</div><p className="text-sm text-slate-500">{item.email} · {item.organizations.join(", ")}</p></div><button disabled={item.id === user.id || toggleUser.isPending} onClick={() => toggleUser.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40 ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Khóa" : "Mở khóa"}</button></div>)}</Panel>}
      {section === "chatbots" && <Panel title="Chatbot của tất cả khách hàng">{chatbots.data?.length === 0 && <EmptyState label="Chưa có chatbot."/>}{chatbots.data?.map((item) => <div key={item.id} className="grid gap-3 border-b p-5 last:border-0 md:grid-cols-[1fr_auto_auto]"><div><p className="font-black">{item.name}</p><p className="text-sm text-slate-500">{item.organization_name} · ID {item.public_id}</p></div><div className="text-sm"><b>{item.credit_balance.toLocaleString("vi-VN")}</b> lượt còn · <b>{item.usage_count.toLocaleString("vi-VN")}</b> đã dùng</div><button disabled={toggleChatbot.isPending} onClick={() => toggleChatbot.mutate(item)} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40 ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Tắt chatbot" : "Bật chatbot"}</button></div>)}</Panel>}
      {section === "documents" && <DocumentsPanel documents={documents.data} moderation={moderation.data} onToggleModeration={(value) => toggleModeration.mutate(value)} onAiReview={(id) => aiReview.mutate(id)} onReview={(id, approval_status) => reviewDocument.mutate({ id, approval_status })}/>}
      {section === "tickets" && <><TicketChat tickets={tickets.data} selectedId={selectedTicketId} viewer="ADMIN" reply={ticketReply} files={ticketFiles} sending={replyTicket.isPending} onSelect={(ticket) => { setSelectedTicketId(ticket.id); if (ticket.admin_unread_count > 0) markTicketRead.mutate(ticket.id); }} onReplyChange={setTicketReply} onFilesChange={setTicketFiles} onSend={(ticket) => replyTicket.mutate(ticket)} onStatus={(ticket, status) => ticketStatus.mutate({ id: ticket.id, status })}/>{replyTicket.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{replyTicket.error.message}</p>}</>}
      {section === "payments" && <Panel title="Lịch sử thanh toán">{payments.data?.length === 0 && <EmptyState label="Chưa có giao dịch."/>}{payments.data?.map((item) => <div key={item.id} className="grid gap-2 border-b p-5 last:border-0 md:grid-cols-[1fr_1fr_auto_auto]"><div><p className="font-black">{item.order_code}</p><p className="text-sm text-slate-500">{item.organization_name}</p></div><p>{item.product_name}</p><b>{item.amount.toLocaleString("vi-VN")} ₫</b><Badge tone={item.status === "SUCCESS" ? "green" : item.status === "PENDING" ? "amber" : "red"}>{item.status}</Badge></div>)}</Panel>}
      {section === "settings" && <Panel title="Cấu hình kiểm duyệt"><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-black">Tự động duyệt tài liệu</p><p className="mt-1 text-sm text-slate-500">Khi tắt, mọi tài liệu xử lý xong đều phải được Admin duyệt tay.</p></div><button onClick={() => toggleModeration.mutate(!(moderation.data?.auto_review ?? true))} className={`rounded-full px-5 py-2 font-black ${(moderation.data?.auto_review ?? true) ? "bg-emerald-600 text-white" : "bg-slate-300"}`}>{(moderation.data?.auto_review ?? true) ? "BẬT" : "TẮT"}</button></div></Panel>}
    </div></main>
  </div>;
}

function EmptyState({ label }: { label: string }) {
  return <p className="p-8 text-center text-slate-500">{label}</p>;
}

function DocumentsPanel({ documents, moderation, onToggleModeration, onAiReview, onReview }: { documents?: AdminDocument[]; moderation?: ModerationSettings; onToggleModeration: (value: boolean) => void; onAiReview: (id: string) => void; onReview: (id: string, status: string) => void }) {
  return <div className="space-y-5"><section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"><div><h2 className="font-black text-blue-950">Duyệt tự động bằng AI</h2><p className="mt-1 text-sm text-blue-800">Kiểm tra tín hiệu sản phẩm, cột giá và giá trị tiền. Không đạt sẽ chuyển sang chờ duyệt tay.</p></div><button onClick={() => onToggleModeration(!(moderation?.auto_review ?? true))} className={`rounded-full px-5 py-2 font-black ${(moderation?.auto_review ?? true) ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800"}`}>{(moderation?.auto_review ?? true) ? "Đang bật" : "Đang tắt"}</button></section><Panel title="Kho tài liệu toàn hệ thống">{documents?.length === 0 && <EmptyState label="Chưa có tài liệu."/>}{documents?.map((item) => <div key={item.id} className="border-b p-5 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{item.original_name}</p><p className="text-sm text-slate-500">{item.organization_name} · {(item.size_bytes / 1024).toFixed(1)} KB</p></div><Badge tone={item.approval_status === "APPROVED" ? "green" : item.approval_status === "REJECTED" ? "red" : "amber"}>{item.approval_status}</Badge></div>{item.ai_review && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>AI score: {item.ai_review.score}/100</b><p className="mt-1 text-slate-600">{item.ai_review.summary}</p>{item.ai_review.issues?.length > 0 && <p className="mt-1 text-red-600">{item.ai_review.issues.join(" · ")}</p>}</div>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={() => onAiReview(item.id)} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">AI kiểm tra</button><button onClick={() => onReview(item.id, "APPROVED")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={15}/>Duyệt</button><button onClick={() => onReview(item.id, "REJECTED")} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><XCircle size={15}/>Từ chối</button></div></div>)}</Panel></div>;
}
