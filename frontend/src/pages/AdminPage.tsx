import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { RequestIdHelper } from "../components/RequestIdDisplay";
import { SystemArchitectureModal } from "../components/SystemArchitectureModal";
import { TechnicalCard } from "../components/TechnicalCross";
import { TicketChat } from "../components/TicketChat";
import { TopStatusBar } from "../components/TopStatusBar";
import { api, uploadApi } from "../services/api";
import type {
  AdminAuditEvent,
  AdminChatbot,
  AdminDocument,
  AdminOrganization,
  AdminPayment,
  AdminSummary,
  AdminUser,
  ModerationSettings,
  SupportTicket,
} from "../types";

type Section =
  | "overview"
  | "organizations"
  | "users"
  | "chatbots"
  | "documents"
  | "tickets"
  | "payments"
  | "settings";

const navigation: Array<[string, Section]> = [
  ["Tổng quan", "overview"],
  ["Doanh nghiệp", "organizations"],
  ["Người dùng", "users"],
  ["Chatbot", "chatbots"],
  ["Duyệt tài liệu", "documents"],
  ["Hỗ trợ", "tickets"],
  ["Thanh toán", "payments"],
  ["Cài đặt & kiểm toán", "settings"],
];

const sectionCopy: Record<Section, string> = {
  overview: "Sức khỏe vận hành toàn hệ thống và các công việc đang chờ giải quyết.",
  organizations: "Xem và quản lý trạng thái hoạt động của từng doanh nghiệp.",
  users: "Quản lý tài khoản, quyền truy cập, lượt dùng và số vị trí chatbot.",
  chatbots: "Xem, chỉnh sửa và quản lý lượt dùng của chatbot thuộc các doanh nghiệp.",
  documents: "Kiểm tra tài liệu trước khi cho phép chatbot sử dụng.",
  tickets: "Tiếp nhận và trả lời yêu cầu hỗ trợ của khách hàng.",
  payments: "Theo dõi đơn hàng và trạng thái thanh toán qua VietQR.",
  settings: "Xem lại các thao tác quản trị gần đây.",
};

const documentStatus: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

const paymentStatus: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  SUCCESS: "Đã thanh toán",
  FAILED: "Thất bại",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã hủy",
};

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-800 border-slate-300",
    green: "bg-emerald-50 text-emerald-800 border-emerald-300",
    red: "bg-red-50 text-red-800 border-red-300",
    amber: "bg-amber-50 text-amber-900 border-amber-300",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 font-black border ${colors[tone]}`}>
      {children}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-swiss-strong bg-white">
      <div className="border-b border-slate-200 px-5 py-3.5 bg-slate-50 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="p-8 text-center text-slate-500 text-sm">{label}</p>;
}

function CreditForm({
  onSubmit,
  pending,
  maximum = 1_000_000,
  label = "Áp dụng",
  placeholder = "Số lượt (+ cấp, − thu hồi)",
}: {
  onSubmit: (amount: number, reason: string) => Promise<unknown>;
  pending: boolean;
  maximum?: number;
  label?: string;
  placeholder?: string;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const value = Number(amount);
  const valid =
    Number.isInteger(value) && value !== 0 && Math.abs(value) <= maximum && reason.trim().length >= 3;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          onSubmit(value, reason.trim())
            .then(() => {
              setAmount("");
              setReason("");
            })
            .catch(() => {});
        }
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <input
        aria-label="Số lượng"
        type="number"
        min={-maximum}
        max={maximum}
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={placeholder}
        className="input-swiss text-sm w-48"
      />
      <input
        aria-label="Lý do"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="Nhập lý do điều chỉnh..."
        className="input-swiss text-sm flex-1 min-w-[200px]"
      />
      <button
        type="submit"
        disabled={!valid || pending}
        className="btn-swiss-primary text-sm py-1.5 px-4"
      >
        {label}
      </button>
    </form>
  );
}

export function AdminPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const section: Section = navigation.find(([, id]) => id === requestedSection)?.[1] ?? "overview";
  const setSection = (next: Section) => setSearchParams(next === "overview" ? {} : { section: next });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFiles, setTicketFiles] = useState<File[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [chatbotSearch, setChatbotSearch] = useState("");
  const [documentFilter, setDocumentFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [showArchModal, setShowArchModal] = useState(false);

  const enabled = !!user?.is_super_admin;
  const summary = useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => api<AdminSummary>("/admin/summary"),
    enabled,
    refetchInterval: 12000,
  });

  const organizations = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: () => api<AdminOrganization[]>("/admin/organizations"),
    enabled: enabled && section === "organizations",
  });

  const users = useQuery({
    queryKey: ["admin-users", userSearch],
    queryFn: () => api<AdminUser[]>(`/admin/users?search=${encodeURIComponent(userSearch)}`),
    enabled: enabled && section === "users",
  });

  const chatbots = useQuery({
    queryKey: ["admin-chatbots", chatbotSearch],
    queryFn: () => api<AdminChatbot[]>(`/admin/chatbots?search=${encodeURIComponent(chatbotSearch)}`),
    enabled: enabled && section === "chatbots",
  });

  const documents = useQuery({
    queryKey: ["admin-documents"],
    queryFn: () => api<AdminDocument[]>("/admin/documents"),
    enabled: enabled && section === "documents",
    refetchInterval: 6000,
  });

  const tickets = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: () => api<SupportTicket[]>("/admin/tickets"),
    enabled: enabled && section === "tickets",
    refetchInterval: 6000,
  });

  const payments = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api<AdminPayment[]>("/admin/payments"),
    enabled: enabled && section === "payments",
  });

  const moderation = useQuery({
    queryKey: ["admin-moderation"],
    queryFn: () => api<ModerationSettings>("/admin/settings/moderation"),
    enabled: enabled && (section === "documents" || section === "settings"),
  });

  const auditLogs = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () => api<AdminAuditEvent[]>("/admin/audit-logs"),
    enabled: enabled && section === "settings",
  });

  const invalidate = (...keys: string[]) =>
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

  // MUTATIONS
  const toggleOrganization = useMutation({
    mutationFn: (item: AdminOrganization) =>
      api<AdminOrganization>(`/admin/organizations/${item.id}`, {
        method: "PATCH",
        body: { is_active: !item.is_active },
      }),
    onSuccess: () => invalidate("admin-organizations", "admin-summary"),
  });

  const toggleUser = useMutation({
    mutationFn: (item: AdminUser) =>
      api<AdminUser>(`/admin/users/${item.id}`, {
        method: "PATCH",
        body: { is_active: !item.is_active },
      }),
    onSuccess: () => invalidate("admin-users"),
  });

  const toggleAdmin = useMutation({
    mutationFn: (item: AdminUser) =>
      api<AdminUser>(`/admin/users/${item.id}`, {
        method: "PATCH",
        body: { is_super_admin: !item.is_super_admin },
      }),
    onSuccess: () => invalidate("admin-users"),
  });

  const editUser = useMutation({
    mutationFn: ({ id, full_name, email }: { id: string; full_name: string; email: string }) =>
      api<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: { full_name, email } }),
    onSuccess: () => invalidate("admin-users"),
  });

  const userCredits = useMutation({
    mutationFn: ({
      userId,
      organizationId,
      amount,
      reason,
    }: {
      userId: string;
      organizationId: string;
      amount: number;
      reason: string;
    }) =>
      api<{ purchased_remaining: number }>(`/admin/users/${userId}/credits`, {
        method: "POST",
        body: { organization_id: organizationId, amount, reason },
      }),
    onSuccess: () => invalidate("admin-users", "admin-organizations"),
  });

  const userSlots = useMutation({
    mutationFn: ({
      userId,
      organizationId,
      amount,
      reason,
    }: {
      userId: string;
      organizationId: string;
      amount: number;
      reason: string;
    }) =>
      api<{ chatbot_slots: number }>(`/admin/users/${userId}/slots`, {
        method: "POST",
        body: { organization_id: organizationId, amount, reason },
      }),
    onSuccess: () => invalidate("admin-users"),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) =>
      api<{ temporary_password: string }>(`/admin/users/${id}/reset-password`, { method: "POST" }),
  });

  const toggleChatbot = useMutation({
    mutationFn: (item: AdminChatbot) =>
      api<AdminChatbot>(`/admin/chatbots/${item.id}`, {
        method: "PATCH",
        body: { is_active: !item.is_active },
      }),
    onSuccess: () => invalidate("admin-chatbots"),
  });

  const editChatbot = useMutation({
    mutationFn: ({
      id,
      name,
      greeting,
      description,
      tone,
      primary_color,
    }: {
      id: string;
      name: string;
      greeting: string;
      description: string;
      tone: string;
      primary_color: string;
    }) =>
      api<AdminChatbot>(`/admin/chatbots/${id}`, {
        method: "PATCH",
        body: { name, greeting, description, tone, primary_color },
      }),
    onSuccess: () => invalidate("admin-chatbots"),
  });

  const chatbotCredits = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api<AdminChatbot>(`/admin/chatbots/${id}/credits`, {
        method: "POST",
        body: { amount, reason },
      }),
    onSuccess: () => invalidate("admin-chatbots"),
  });

  const reviewDocument = useMutation({
    mutationFn: ({ id, approval_status }: { id: string; approval_status: string }) =>
      api<AdminDocument>(`/admin/documents/${id}/approval`, {
        method: "PATCH",
        body: { approval_status },
      }),
    onSuccess: () => invalidate("admin-documents", "admin-summary"),
  });

  const aiReview = useMutation({
    mutationFn: (id: string) =>
      api<AdminDocument>(`/admin/documents/${id}/ai-review`, { method: "POST" }),
    onSuccess: () => invalidate("admin-documents", "admin-summary"),
  });

  const toggleModeration = useMutation({
    mutationFn: (auto_review: boolean) =>
      api<ModerationSettings>("/admin/settings/moderation", {
        method: "PUT",
        body: { auto_review },
      }),
    onSuccess: () => invalidate("admin-moderation", "admin-documents", "admin-summary"),
  });

  const replyTicketAdmin = useMutation({
    mutationFn: async (ticket: SupportTicket) => {
      if (ticketFiles.length > 0) {
        const form = new FormData();
        ticketFiles.forEach((f) => form.append("files", f));
        form.append("message", ticketReply.trim());
        return uploadApi<SupportTicket>(`/admin/tickets/${ticket.id}/attachments`, form);
      }
      return api<SupportTicket>(`/admin/tickets/${ticket.id}/replies`, {
        method: "POST",
        body: { message: ticketReply.trim() },
      });
    },
    onSuccess: () => {
      setTicketReply("");
      setTicketFiles([]);
      invalidate("admin-tickets", "admin-summary");
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api<SupportTicket>(`/admin/tickets/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => invalidate("admin-tickets", "admin-summary"),
  });

  const markTicketReadAdmin = useMutation({
    mutationFn: (id: string) => api<SupportTicket>(`/admin/tickets/${id}/read`, { method: "PATCH" }),
    onMutate: (id) =>
      queryClient.setQueryData<SupportTicket[]>(["admin-tickets"], (cur) =>
        cur?.map((t) => (t.id === id ? { ...t, admin_unread_count: 0 } : t))
      ),
    onSuccess: () => invalidate("admin-tickets", "admin-summary"),
  });

  useEffect(() => {
    if (section !== "tickets" || !tickets.data?.length || markTicketReadAdmin.isPending) return;
    const selected = tickets.data.find((t) => t.id === selectedTicketId) ?? tickets.data[0];
    if (selectedTicketId !== selected.id) setSelectedTicketId(selected.id);
    if (selected.admin_unread_count > 0) markTicketReadAdmin.mutate(selected.id);
  }, [section, selectedTicketId, tickets.data, markTicketReadAdmin]);

  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_super_admin) return <Navigate to="/app" replace />;

  const metricCards = summary.data
    ? [
        ["Doanh nghiệp", summary.data.organizations, "organizations"],
        ["Người dùng", summary.data.users, "users"],
        ["Chatbot", summary.data.chatbots, "chatbots"],
        ["Hội thoại", summary.data.conversations, "overview"],
        ["Khách hàng tiềm năng", summary.data.leads, "overview"],
        ["Tài liệu chờ duyệt", summary.data.documents_pending_review, "documents"],
        ["Yêu cầu hỗ trợ đang mở", summary.data.tickets_open, "tickets"],
        ["Thanh toán đang chờ", summary.data.payments_pending, "payments"],
      ] as Array<[string, number, Section]>
    : [];

  const activeQuery =
    section === "overview"
      ? summary
      : section === "organizations"
      ? organizations
      : section === "users"
      ? users
      : section === "chatbots"
      ? chatbots
      : section === "documents"
      ? documents
      : section === "tickets"
      ? tickets
      : section === "payments"
      ? payments
      : moderation;

  const actionError = [
    toggleOrganization,
    toggleUser,
    toggleAdmin,
    editUser,
    userCredits,
    userSlots,
    resetPassword,
    toggleChatbot,
    editChatbot,
    chatbotCredits,
    reviewDocument,
    aiReview,
    toggleModeration,
    replyTicketAdmin,
    updateTicketStatus,
  ].find((m) => m.isError)?.error;

  return (
    <div className="workspace-shell admin-shell min-h-screen flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-5 py-3 lg:px-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-[#2455c7] text-sm font-black text-white">M</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-950">
                Mạch AI · Quản trị hệ thống
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              {user.full_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {user.organizations.length > 0 && <Link to="/app" className="btn-swiss-secondary text-sm py-1.5 px-3">
            Khu khách hàng
          </Link>}

          <button onClick={logout} className="btn-swiss-secondary text-sm py-1.5 px-3">
            Đăng xuất
          </button>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 lg:grid lg:grid-cols-[250px_1fr]">
        {/* SIDEBAR */}
        <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-3 lg:p-4 flex flex-col justify-between min-w-0">
          <div>
            <div className="hidden lg:block px-2 py-2 border-b border-slate-800 mb-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase block font-bold">
                Điều hướng quản trị
              </span>
            </div>

            <nav aria-label="Mục quản trị" className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 text-sm">
              {navigation.map(([label, id]) => {
                const isActive = section === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSection(id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`shrink-0 lg:w-full flex items-center justify-between gap-3 p-2.5 font-bold text-left transition-colors border ${
                      isActive
                        ? "bg-[#edf3ff] text-[#1947b2] border-[#dbe7ff]"
                        : "text-slate-600 border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span>{label}</span>
                    {id === "tickets" && (summary.data?.tickets_unread ?? 0) > 0 ? (
                      <span className="bg-red-600 text-white px-1.5 py-0.2 text-[9px] font-black">
                        {summary.data?.tickets_unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden lg:block border-t border-slate-200 pt-3 text-xs text-slate-500">
            Tài khoản quản trị · {user.email}
          </div>
        </aside>

        {/* CONTENT */}
        <main className="p-5 lg:p-8 min-w-0 max-w-7xl mx-auto w-full space-y-6">
          {/* SECTION HEADER */}
          <div className="border-b border-slate-200 pb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                Khu quản trị
              </span>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {navigation.find(([, id]) => id === section)?.[0]}
              </h2>
              <p className="mt-1 text-xs text-slate-600 font-sans">{sectionCopy[section]}</p>
            </div>
          </div>

          {activeQuery.isPending && <div className="border border-slate-200 bg-white p-4 text-sm text-slate-600" role="status">Đang tải dữ liệu quản trị...</div>}
          {activeQuery.isError && <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">Không tải được dữ liệu của mục này. Vui lòng thử lại.</div>}

          {/* ERROR ALERT */}
          {actionError && (
             <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
               <b>Không thể hoàn thành thao tác:</b> {actionError.message}
            </div>
          )}

          {/* OVERVIEW SECTION */}
          {section === "overview" && (
            <div className="space-y-6">
              <TopStatusBar />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                 {metricCards.map(([label, val, target]) => (
                   <button key={label} type="button" onClick={() => setSection(target)} className="card-swiss bg-white p-5 text-left hover:border-[#2455c7] focus-visible:outline">
                     <span className="text-sm font-medium text-slate-600">{label}</span>
                     <strong className="text-4xl font-bold tracking-tight text-slate-950 mt-4 block">{val.toLocaleString("vi-VN")}</strong>
                     {target !== "overview" && <span className="mt-3 block text-xs font-semibold text-[#2455c7]">Xem chi tiết →</span>}
                   </button>
                 ))}
              </div>

              <button type="button" onClick={() => setShowArchModal(true)} className="btn-swiss-secondary">Xem kiến trúc hệ thống</button>

              <RequestIdHelper />
            </div>
          )}

          {/* ORGANIZATIONS SECTION */}
          {section === "organizations" && (
            <Panel title="Doanh nghiệp trên nền tảng">
              {organizations.data?.length === 0 && <EmptyState label="Chưa có doanh nghiệp nào." />}
              <div className="divide-y divide-slate-100 font-mono text-xs">
                {organizations.data?.map((org) => (
                  <div key={org.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
                    <div>
                      <b className="text-sm font-sans text-slate-950 block">{org.name}</b>
                      <span className="text-slate-500 text-[11px]">
                         Đường dẫn: {org.slug} · Tạo ngày {new Date(org.created_at).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={toggleOrganization.isPending}
                       onClick={() => {
                         if (window.confirm(`${org.is_active ? "Tạm ngưng" : "Kích hoạt"} doanh nghiệp ${org.name}?`)) toggleOrganization.mutate(org);
                       }}
                      className={`btn-swiss-secondary text-xs py-1.5 px-3 font-mono ${
                        org.is_active ? "text-red-700" : "text-emerald-700"
                      }`}
                    >
                       {org.is_active ? "Tạm ngưng" : "Kích hoạt"}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* USERS SECTION */}
          {section === "users" && (
            <Panel title="Tài khoản người dùng">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-2">
                <input
                  aria-label="Tìm kiếm người dùng"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Tìm theo email hoặc họ tên..."
                  className="input-swiss text-xs font-mono max-w-md"
                />
              </div>

              {users.data?.length === 0 && <EmptyState label="Không tìm thấy tài khoản người dùng." />}
              <div className="divide-y divide-slate-200">
                {users.data?.map((u) => (
                  <article key={u.id} className="p-5 font-mono text-xs space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-slate-950 font-sans">{u.full_name}</h4>
                          {u.is_super_admin && <Badge tone="blue">Quản trị viên</Badge>}
                          {!u.is_active && <Badge tone="red">Đã khóa</Badge>}
                        </div>
                        <p className="text-slate-600 text-sm mt-1">{u.email}</p>
                        <p className="text-slate-400 text-xs mt-1">Mã tài khoản: {u.id}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={u.id === user.id}
                          onClick={() => {
                            if (window.confirm(`${u.is_super_admin ? "Thu hồi" : "Cấp"} quyền Admin cho ${u.email}?`)) {
                              toggleAdmin.mutate(u);
                            }
                          }}
                          className="btn-swiss-secondary text-xs py-1 px-2.5 font-mono"
                        >
                          {u.is_super_admin ? "Thu hồi quyền admin" : "Cấp quyền admin"}
                        </button>

                        <button
                          type="button"
                          disabled={u.id === user.id}
                          onClick={() => {
                            if (window.confirm(`Đặt lại mật khẩu cho ${u.email}?`)) {
                               resetPassword.mutateAsync(u.id).then((res) => {
                                 window.alert(`Mật khẩu tạm thời cho ${u.email}: \n\n${res.temporary_password}\n\nHãy gửi riêng cho người dùng.`);
                               }).catch(() => {});
                            }
                          }}
                          className="btn-swiss-secondary text-xs py-1 px-2.5 font-mono text-amber-800"
                        >
                          Đặt lại mật khẩu
                        </button>

                        <button
                          type="button"
                          disabled={u.id === user.id}
                          onClick={() => {
                            if (window.confirm(`${u.is_active ? "Khóa" : "Mở khóa"} tài khoản ${u.email}?`)) toggleUser.mutate(u);
                          }}
                          className={`btn-swiss-secondary text-xs py-1 px-2.5 font-mono ${
                            u.is_active ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          {u.is_active ? "Khóa tài khoản" : "Mở khóa"}
                        </button>
                      </div>
                    </div>

                    <details className="border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-[#2455c7]">Chỉnh sửa tên và email</summary>
                      <form
                        className="mt-3 grid gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          editUser.mutate({
                            id: u.id,
                            full_name: String(form.get("full_name") || "").trim(),
                            email: String(form.get("email") || "").trim(),
                          });
                        }}
                      >
                        <label className="text-sm text-slate-700">Họ tên
                          <input name="full_name" defaultValue={u.full_name} minLength={2} maxLength={200} required className="input-swiss mt-1" />
                        </label>
                        <label className="text-sm text-slate-700">Email
                          <input name="email" type="email" defaultValue={u.email} required className="input-swiss mt-1" />
                        </label>
                        <button type="submit" disabled={editUser.isPending} className="btn-swiss-secondary sm:col-span-2 sm:justify-self-start">Lưu thông tin</button>
                      </form>
                    </details>

                    {/* ORG WALLET AND CHATBOT SLOTS */}
                    {u.organization_accounts.map((acc) => (
                      <details key={acc.id} className="border border-slate-200 bg-slate-50 p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                          {acc.name} · Ví chung: {acc.purchased_remaining.toLocaleString("vi-VN")} lượt · Chatbot: {acc.chatbot_count}/{acc.chatbot_slots}
                        </summary>
                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <div className="border border-slate-200 bg-white p-4">
                            <p className="font-semibold text-sm">Cấp hoặc thu hồi lượt trong ví chung</p>
                            <p className="mt-1 text-sm text-slate-600">Nhập số dương để cấp, số âm để thu hồi. Cần ghi lý do.</p>
                            <CreditForm
                              onSubmit={(amount, reason) => userCredits.mutateAsync({ userId: u.id, organizationId: acc.id, amount, reason })}
                              pending={userCredits.isPending}
                              label="Điều chỉnh lượt"
                            />
                          </div>
                          <div className="border border-slate-200 bg-white p-4">
                            <p className="font-semibold text-sm">Vị trí chatbot</p>
                            <p className="mt-1 text-sm text-slate-600">Tăng hoặc giảm số chatbot doanh nghiệp được tạo. Không thể giảm dưới số đang dùng.</p>
                            <CreditForm
                              onSubmit={(amount, reason) => userSlots.mutateAsync({ userId: u.id, organizationId: acc.id, amount, reason })}
                              pending={userSlots.isPending}
                              maximum={100}
                              label="Điều chỉnh vị trí"
                              placeholder="Số vị trí (+ tăng, − giảm)"
                            />
                          </div>
                        </div>
                      </details>
                    ))}
                  </article>
                ))}
              </div>
            </Panel>
          )}

          {/* CHATBOTS SECTION */}
          {section === "chatbots" && (
            <Panel title="Chatbot của khách hàng">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-2">
                <input
                  aria-label="Tìm chatbot"
                  value={chatbotSearch}
                  onChange={(e) => setChatbotSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc Public ID..."
                  className="input-swiss text-xs font-mono max-w-md"
                />
              </div>

              {chatbots.data?.length === 0 && <EmptyState label="Không tìm thấy chatbot nào." />}
              <div className="divide-y divide-slate-200">
                {chatbots.data?.map((bot) => (
                  <article key={bot.id} className="p-5 font-mono text-xs space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-slate-950 font-sans">{bot.name}</h4>
                          <Badge tone={bot.is_active ? "green" : "red"}>
                            {bot.is_active ? "ĐANG BẬT" : "ĐÃ TẮT"}
                          </Badge>
                        </div>
                        <p className="text-slate-600 text-sm mt-1">{bot.organization_name} · {bot.owner_emails.join(", ") || "Chưa có email quản lý"}</p>
                        <p className="text-slate-400 text-xs mt-1">Mã nhúng: {bot.public_id}</p>
                        <p className="text-slate-600 text-sm mt-2">Còn {bot.credit_balance.toLocaleString("vi-VN")} lượt · Đã dùng {bot.usage_count.toLocaleString("vi-VN")} lượt</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`${bot.is_active ? "Tắt" : "Bật"} chatbot ${bot.name}?`)) toggleChatbot.mutate(bot);
                        }}
                        className={`btn-swiss-secondary text-xs py-1 px-3 font-mono ${
                          bot.is_active ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {bot.is_active ? "Tắt chatbot" : "Bật chatbot"}
                      </button>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                       <details className="border border-slate-200 bg-slate-50 p-4">
                         <summary className="cursor-pointer text-sm font-semibold text-[#2455c7]">Chỉnh sửa nội dung và giao diện</summary>
                         <form
                           className="mt-4 grid gap-3"
                           onSubmit={(event) => {
                             event.preventDefault();
                             const form = new FormData(event.currentTarget);
                             editChatbot.mutate({
                               id: bot.id,
                               name: String(form.get("name") || "").trim(),
                               description: String(form.get("description") || "").trim(),
                               greeting: String(form.get("greeting") || "").trim(),
                               tone: String(form.get("tone") || "professional"),
                               primary_color: String(form.get("primary_color") || "#2455c7"),
                             });
                           }}
                         >
                           <label className="text-sm">Tên chatbot<input name="name" defaultValue={bot.name} minLength={2} maxLength={120} required className="input-swiss mt-1" /></label>
                           <label className="text-sm">Mô tả<textarea name="description" defaultValue={bot.description || ""} maxLength={2000} rows={2} className="input-swiss mt-1" /></label>
                           <label className="text-sm">Lời chào<textarea name="greeting" defaultValue={bot.greeting} maxLength={500} required rows={2} className="input-swiss mt-1" /></label>
                           <div className="grid gap-3 sm:grid-cols-2">
                             <label className="text-sm">Giọng điệu
                               <select name="tone" defaultValue={bot.tone} className="input-swiss mt-1">
                                 <option value="professional">Chuyên nghiệp</option>
                                 <option value="friendly">Thân thiện</option>
                                 <option value="concise">Ngắn gọn</option>
                               </select>
                             </label>
                             <label className="text-sm">Màu chủ đạo<input name="primary_color" type="color" defaultValue={bot.primary_color} className="input-swiss mt-1" /></label>
                           </div>
                           <button type="submit" disabled={editChatbot.isPending} className="btn-swiss-secondary justify-self-start">Lưu chatbot</button>
                         </form>
                       </details>
                       <details className="border border-slate-200 bg-slate-50 p-4">
                         <summary className="cursor-pointer text-sm font-semibold text-[#2455c7]">Điều chỉnh lượt của chatbot</summary>
                         <p className="mt-3 text-sm text-slate-600">Số dương để cấp, số âm để thu hồi. Thay đổi này tác động trực tiếp đến chatbot.</p>
                         <CreditForm
                           onSubmit={(amount, reason) => chatbotCredits.mutateAsync({ id: bot.id, amount, reason })}
                           pending={chatbotCredits.isPending}
                           label="Điều chỉnh lượt"
                         />
                       </details>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          )}

          {/* DOCUMENTS SECTION */}
          {section === "documents" && (
            <div className="space-y-6">
              {/* MODERATION TOGGLE */}
              <TechnicalCard strong className="p-5 bg-blue-50/20 border-2 border-[#0052FF] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    Duyệt tài liệu tự động bằng AI
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Khi bật, tài liệu mới được AI đánh giá và chỉ tự duyệt nếu đạt yêu cầu. Khi tắt, tài liệu phải chờ quản trị viên duyệt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleModeration.mutate(!(moderation.data?.auto_review ?? false))}
                  disabled={toggleModeration.isPending || moderation.isPending}
                  className={`btn-swiss-primary text-sm py-2 px-5 ${
                    moderation.data?.auto_review ? "bg-emerald-700 border-emerald-900" : "bg-slate-700 border-slate-900"
                  }`}
                >
                  {moderation.data?.auto_review ? "Đang bật" : "Đang tắt"}
                </button>
              </TechnicalCard>

              <Panel title="Tài liệu của doanh nghiệp">
                 <div className="flex gap-2 border-b border-slate-200 p-4">
                   <button type="button" onClick={() => setDocumentFilter("PENDING")} aria-pressed={documentFilter === "PENDING"} className={documentFilter === "PENDING" ? "btn-swiss-primary" : "btn-swiss-secondary"}>Chờ duyệt ({documents.data?.filter((doc) => doc.approval_status === "PENDING").length ?? 0})</button>
                   <button type="button" onClick={() => setDocumentFilter("ALL")} aria-pressed={documentFilter === "ALL"} className={documentFilter === "ALL" ? "btn-swiss-primary" : "btn-swiss-secondary"}>Tất cả</button>
                 </div>
                 {documents.data?.length === 0 && <EmptyState label="Chưa có tài liệu nào." />}
                 {documents.data && documents.data.length > 0 && documentFilter === "PENDING" && !documents.data.some((doc) => doc.approval_status === "PENDING") && <EmptyState label="Không có tài liệu đang chờ duyệt." />}
                 <div className="divide-y divide-slate-200">
                   {documents.data?.filter((doc) => documentFilter === "ALL" || doc.approval_status === "PENDING").map((doc) => (
                    <div key={doc.id} className="p-5 font-mono text-xs space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b className="text-sm font-sans text-slate-950 block">{doc.original_name}</b>
                          <span className="text-slate-500 text-[11px]">
                             {doc.organization_name} · {(doc.size_bytes / 1024).toFixed(1)} KB · Tải lên {new Date(doc.created_at).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <Badge
                          tone={
                            doc.approval_status === "APPROVED"
                              ? "green"
                              : doc.approval_status === "REJECTED"
                              ? "red"
                              : "amber"
                          }
                        >
                           {documentStatus[doc.approval_status] ?? doc.approval_status}
                        </Badge>
                      </div>

                      {doc.ai_review && (
                        <div className="p-3 bg-slate-50 border border-slate-200 font-mono text-xs">
                           <b>Đánh giá AI: {doc.ai_review.score}/100 · {doc.ai_review.passed ? "Đạt" : "Cần kiểm tra"}</b>
                           <p className="mt-1 text-slate-700 font-sans">{doc.ai_review.summary}</p>
                           {doc.ai_review.issues.length > 0 && <p className="mt-1 text-slate-600">Lưu ý: {doc.ai_review.issues.join("; ")}</p>}
                         </div>
                       )}

                       {doc.approval_note && <p className="text-sm text-slate-600">Ghi chú duyệt: {doc.approval_note}</p>}

                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => aiReview.mutate(doc.id)}
                          disabled={aiReview.isPending}
                          className="btn-swiss-secondary text-xs py-1.5 px-3 font-mono"
                        >
                           {aiReview.isPending ? "Đang đánh giá..." : "Đánh giá bằng AI"}
                        </button>
                        <button
                          type="button"
                           onClick={() => {
                             if (window.confirm(`Duyệt tài liệu ${doc.original_name} để chatbot có thể sử dụng?`)) reviewDocument.mutate({ id: doc.id, approval_status: "APPROVED" });
                           }}
                           disabled={reviewDocument.isPending || doc.approval_status === "APPROVED"}
                           className="btn-swiss-primary text-xs py-1.5 px-3 bg-emerald-700 border-emerald-900"
                         >
                           Duyệt tài liệu
                        </button>
                        <button
                          type="button"
                           onClick={() => {
                             if (window.confirm(`Từ chối tài liệu ${doc.original_name}?`)) reviewDocument.mutate({ id: doc.id, approval_status: "REJECTED" });
                           }}
                           disabled={reviewDocument.isPending || doc.approval_status === "REJECTED"}
                           className="btn-swiss-danger text-xs py-1.5 px-3"
                         >
                           Từ chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* TICKETS SECTION */}
          {section === "tickets" && (
            <TicketChat
              tickets={tickets.data}
              selectedId={selectedTicketId}
              viewer="ADMIN"
              reply={ticketReply}
              files={ticketFiles}
              sending={replyTicketAdmin.isPending}
              onSelect={(t) => {
                setSelectedTicketId(t.id);
                if (t.admin_unread_count > 0) markTicketReadAdmin.mutate(t.id);
              }}
              onReplyChange={setTicketReply}
              onFilesChange={setTicketFiles}
              onSend={(t) => replyTicketAdmin.mutate(t)}
              onStatus={(t, st) => updateTicketStatus.mutate({ id: t.id, status: st })}
            />
          )}

          {/* PAYMENTS SECTION */}
          {section === "payments" && (
            <Panel title="Giao dịch thanh toán">
              {payments.data?.length === 0 && <EmptyState label="Chưa có giao dịch thanh toán." />}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-100 text-[10px] text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                       <th className="p-3">Mã đơn hàng</th>
                       <th className="p-3">Doanh nghiệp</th>
                       <th className="p-3">Gói sản phẩm</th>
                       <th className="p-3">Số tiền</th>
                       <th className="p-3">Trạng thái</th>
                       <th className="p-3">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.data?.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900 select-all">{p.order_code}</td>
                        <td className="p-3 text-slate-700">{p.organization_name}</td>
                        <td className="p-3">{p.product_name}</td>
                        <td className="p-3 font-bold text-[#0052FF]">
                          {p.amount.toLocaleString("vi-VN")} ₫
                        </td>
                        <td className="p-3">
                          <Badge tone={p.status === "SUCCESS" ? "green" : p.status === "PENDING" ? "amber" : "red"}>
                             {paymentStatus[p.status] ?? p.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">
                          {new Date(p.created_at).toLocaleString("vi-VN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* SETTINGS / AUDIT LOGS */}
          {section === "settings" && (
            <Panel title="Nhật ký kiểm toán (100 sự kiện gần nhất)">
              {auditLogs.data?.length === 0 && <EmptyState label="Chưa có nhật ký kiểm toán." />}
              <div className="divide-y divide-slate-100 font-mono text-xs">
                {auditLogs.data?.map((ev) => (
                  <div key={ev.id} className="p-3.5 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <b className="text-slate-950 font-bold">{ev.action}</b>
                      <span className="text-[11px] text-slate-400">
                        {new Date(ev.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1">
                       Người thực hiện: {ev.actor_email} · Đối tượng: {ev.resource_type} ({ev.resource_id})
                    </p>
                    {ev.metadata_redacted && ev.metadata_redacted !== "{}" && (
                      <code className="block mt-1 bg-slate-900 text-slate-200 p-2 text-[10px] break-all">
                        {ev.metadata_redacted}
                      </code>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </main>
      </div>

      <SystemArchitectureModal isOpen={showArchModal} onClose={() => setShowArchModal(false)} />
    </div>
  );
}
