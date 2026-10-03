import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  FileText,
  Paperclip,
  Plus,
  QrCode,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { EnterpriseChatWorkspace } from "../components/EnterpriseChatWorkspace";
import { PaymentModal } from "../components/PaymentModal";
import { QuotaMeter } from "../components/QuotaMeter";
import { RequestIdHelper } from "../components/RequestIdDisplay";
import { SystemArchitectureModal } from "../components/SystemArchitectureModal";
import { TechnicalCard } from "../components/TechnicalCross";
import { TicketChat } from "../components/TicketChat";
import { TopStatusBar } from "../components/TopStatusBar";
import { api, uploadApi } from "../services/api";
import type {
  Chatbot,
  Conversation,
  ConversationDetail,
  CreditBalance,
  DashboardSummary,
  DocumentItem,
  Lead,
  Page,
  PaymentProduct,
  SupportTicket,
} from "../types";

type View =
  | "overview"
  | "ai-workspace"
  | "chatbots"
  | "documents"
  | "conversations"
  | "leads"
  | "payment"
  | "support"
  | "settings"
  | "observability";

type TelegramStatus = {
  configured: boolean;
  enabled: boolean;
  chat_id_hint: string | null;
  verified_at: string | null;
};

const navItems: Array<[string, View]> = [
  ["Tổng quan", "overview"],
  ["Thử trợ lý AI", "ai-workspace"],
  ["Chatbot", "chatbots"],
  ["Tài liệu", "documents"],
  ["Hội thoại", "conversations"],
  ["Khách hàng", "leads"],
  ["Thanh toán", "payment"],
  ["Hỗ trợ", "support"],
  ["Cài đặt", "settings"],
  ["Nhật ký hệ thống", "observability"],
];

function ChatbotCreditControls({
  balance,
  wallet,
  pending,
  onAllocate,
}: {
  balance: number;
  wallet: number;
  pending: boolean;
  onAllocate: (amount: number) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const count = Number(amount);
  const valid = Number.isInteger(count) && count > 0 && count <= 1_000_000;

  function submit(value: number) {
    onAllocate(value)
      .then(() => setAmount(""))
      .catch(() => {});
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input
        aria-label="Số lượt chuyển"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Nhập số lượt..."
        className="input-swiss text-xs font-mono flex-1 min-w-[120px]"
      />
      <button
        type="button"
        disabled={!valid || count > wallet || pending}
        onClick={() => submit(count)}
        className="btn-swiss-primary text-xs py-1.5 px-3 font-mono"
      >
        CẤP LƯỢT
      </button>
      <button
        type="button"
        disabled={!valid || count > balance || pending}
        onClick={() => submit(-count)}
        className="btn-swiss-secondary text-xs py-1.5 px-3 font-mono text-amber-800"
      >
        THU HỒI VỀ VÍ
      </button>
    </div>
  );
}

function PageControls({ page, pageSize, total, onPageChange }: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>Trang {page} / {pageCount} · {total.toLocaleString("vi-VN")} mục</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="btn-swiss-secondary px-3 py-1.5 text-xs">Trang trước</button>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="btn-swiss-secondary px-3 py-1.5 text-xs">Trang sau</button>
      </div>
    </nav>
  );
}

export function DashboardPage() {
  const { user, organizationId, logout } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: View = navItems.find(([, id]) => id === requestedView)?.[1] ?? "overview";
  const setView = (next: View) => setSearchParams(next === "overview" ? {} : { view: next });
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [conversationPage, setConversationPage] = useState(1);
  const [leadPage, setLeadPage] = useState(1);
  const [name, setName] = useState("");
  const [copiedBotId, setCopiedBotId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<PaymentProduct | null>(null);
  const [showArchModal, setShowArchModal] = useState(false);

  // Telegram states
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramCode, setTelegramCode] = useState("");

  // Customer support states
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketCreateFiles, setTicketCreateFiles] = useState<File[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketReplyFiles, setTicketReplyFiles] = useState<File[]>([]);
  const [showCreateTicket, setShowCreateTicket] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(globalSearch.trim());
      setConversationPage(1);
      setLeadPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [globalSearch]);

  useEffect(() => {
    setGlobalSearch("");
    setSearchTerm("");
    setConversationPage(1);
    setLeadPage(1);
  }, [view]);

  // DATA QUERIES
  const summary = useQuery({
    queryKey: ["dashboard", organizationId],
    queryFn: () => api<DashboardSummary>("/dashboard/summary"),
    enabled: !!organizationId,
    refetchInterval: 15000,
  });

  const chatbots = useQuery({
    queryKey: ["chatbots", organizationId],
    queryFn: () => api<Chatbot[]>("/chatbots"),
    enabled: !!organizationId,
  });

  const documents = useQuery({
    queryKey: ["documents", organizationId],
    queryFn: () => api<DocumentItem[]>("/documents"),
    enabled: !!organizationId && (view === "documents" || view === "overview"),
    refetchInterval: 6000,
  });

  const conversations = useQuery({
    queryKey: ["conversations", organizationId, searchTerm, conversationPage],
    queryFn: () =>
      api<Page<Conversation>>(
        `/conversations?search=${encodeURIComponent(searchTerm)}&page=${conversationPage}&page_size=30`
      ),
    enabled: !!organizationId && view === "conversations",
  });

  const conversationDetail = useQuery({
    queryKey: ["conversation", organizationId, selectedConversationId],
    queryFn: () => api<ConversationDetail>(`/conversations/${selectedConversationId}`),
    enabled: !!organizationId && view === "conversations" && !!selectedConversationId,
  });

  const leads = useQuery({
    queryKey: ["leads", organizationId, view === "overview" ? "" : searchTerm, view === "overview" ? 1 : leadPage],
    queryFn: () =>
      api<Page<Lead>>(`/leads?search=${encodeURIComponent(view === "overview" ? "" : searchTerm)}&page=${view === "overview" ? 1 : leadPage}&page_size=50`),
    enabled: !!organizationId && (view === "leads" || view === "overview"),
  });

  const telegramStatus = useQuery({
    queryKey: ["telegram", organizationId],
    queryFn: () => api<TelegramStatus>("/telegram/status"),
    enabled: !!organizationId && (view === "settings" || view === "leads"),
  });

  const products = useQuery({
    queryKey: ["payment-products"],
    queryFn: () => api<PaymentProduct[]>("/payments/products"),
    enabled: view === "payment" || view === "overview",
  });

  const balance = useQuery({
    queryKey: ["credit-balance"],
    queryFn: () => api<CreditBalance>("/payments/balance"),
    enabled: view === "payment" || view === "overview" || view === "chatbots",
  });

  const tickets = useQuery({
    queryKey: ["tickets", organizationId],
    queryFn: () => api<SupportTicket[]>("/tickets"),
    enabled: !!organizationId && view === "support",
    refetchInterval: 6000,
  });

  // MUTATIONS
  const createChatbot = useMutation({
    mutationFn: (botName: string) => api<Chatbot>("/chatbots", { method: "POST", body: { name: botName } }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["chatbots", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
    },
  });

  const allocateCredits = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api<Chatbot>(`/chatbots/${id}/credits`, { method: "POST", body: { amount } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
    },
  });

  const deleteChatbot = useMutation({
    mutationFn: (id: string) => api<void>(`/chatbots/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", organizationId] });
    },
  });

  const uploadDoc = useMutation({
    mutationFn: (file: File) => {
      if (!/\.(pdf|docx|xlsx)$/i.test(file.name)) {
        throw new Error("Chỉ hỗ trợ tệp PDF, DOCX hoặc XLSX.");
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error("Tệp vượt quá kích thước cho phép (tối đa 25MB).");
      }
      const form = new FormData();
      form.append("file", file);
      return uploadApi<DocumentItem>("/documents/upload", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
    },
  });

  const retryDoc = useMutation({
    mutationFn: (id: string) => api<DocumentItem>(`/documents/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
    },
  });

  const updateLead = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Lead["status"] }) =>
      api<Lead>(`/leads/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads", organizationId] }),
  });

  const telegramChallenge = useMutation({
    mutationFn: () => api<{ detail: string }>("/telegram/challenge", { method: "POST", body: { chat_id: telegramChatId } }),
  });

  const telegramConfirm = useMutation({
    mutationFn: () => api<TelegramStatus>("/telegram/confirm", { method: "POST", body: { code: telegramCode } }),
    onSuccess: () => {
      setTelegramCode("");
      queryClient.invalidateQueries({ queryKey: ["telegram", organizationId] });
    },
  });

  const disableTelegram = useMutation({
    mutationFn: () => api<void>("/telegram", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telegram", organizationId] }),
  });

  // Support ticket mutations
  const createTicket = useMutation({
    mutationFn: async () => {
      let t = await api<SupportTicket>("/tickets", { method: "POST", body: { subject: ticketSubject, message: ticketMessage } });
      if (ticketCreateFiles.length > 0) {
        const form = new FormData();
        ticketCreateFiles.forEach((f) => form.append("files", f));
        form.append("message", "");
        t = await uploadApi<SupportTicket>(`/tickets/${t.id}/attachments`, form);
      }
      return t;
    },
    onSuccess: (t) => {
      setTicketSubject("");
      setTicketMessage("");
      setTicketCreateFiles([]);
      setSelectedTicketId(t.id);
      setShowCreateTicket(false);
      queryClient.invalidateQueries({ queryKey: ["tickets", organizationId] });
    },
  });

  const replyTicket = useMutation({
    mutationFn: async (t: SupportTicket) => {
      if (ticketReplyFiles.length > 0) {
        const form = new FormData();
        ticketReplyFiles.forEach((f) => form.append("files", f));
        form.append("message", ticketReply.trim());
        return uploadApi<SupportTicket>(`/tickets/${t.id}/attachments`, form);
      }
      return api<SupportTicket>(`/tickets/${t.id}/replies`, { method: "POST", body: { message: ticketReply.trim() } });
    },
    onSuccess: () => {
      setTicketReply("");
      setTicketReplyFiles([]);
      queryClient.invalidateQueries({ queryKey: ["tickets", organizationId] });
    },
  });

  const markTicketRead = useMutation({
    mutationFn: (id: string) => api<SupportTicket>(`/tickets/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tickets", organizationId] }),
  });

  if (!user || !organizationId) {
    return <Navigate to="/login" replace />;
  }

  const currentOrg = user.organizations.find((o) => o.id === organizationId);
  const availableSlots = Math.max(
    0,
    (summary.data?.chatbot_slots ?? 1) - (summary.data?.chatbot_count ?? 0)
  );

  return (
    <div className="workspace-shell customer-shell min-h-screen flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-5 py-3 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* LOGO & WORKSPACE TITLE */}
          <div className="flex items-center gap-3">
             <span className="flex h-9 w-9 items-center justify-center bg-[#2455c7] text-sm font-black text-white">M</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {currentOrg?.name || "DOANH NGHIỆP"}
                </span>
                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-xs">
                  {summary.data?.current_plan || "Miễn phí"}
                </span>
              </div>
              <p className="text-xs text-slate-500">Không gian làm việc</p>
            </div>
          </div>

          {/* SEARCH IN THE CURRENT LIST */}
          {(view === "conversations" || view === "leads") && <div className="order-3 flex w-full items-center md:order-none md:w-auto md:flex-1 md:max-w-md md:mx-4">
            <div className="relative w-full">
              <input
                type="text"
                aria-label={view === "conversations" ? "Tìm trong nội dung hội thoại" : "Tìm khách hàng tiềm năng"}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder={view === "conversations" ? "Tìm trong nội dung hội thoại..." : "Tìm tên, số điện thoại, email hoặc nhu cầu..."}
                className="input-swiss text-sm bg-slate-50"
              />
            </div>
          </div>}

          {/* RIGHT ACTIONS & PROFILE */}
          <div className="flex items-center gap-2.5">
            {user.is_super_admin && (
              <Link
                to="/admin"
                className="btn-swiss-secondary text-sm py-1.5 px-3"
              >
                Trang admin
              </Link>
            )}

            <div className="border-l border-slate-200 pl-2.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 hidden lg:inline">
                {user.full_name}
              </span>
              <button
                type="button"
                onClick={logout}
                className="btn-swiss-secondary text-sm py-1.5 px-3 text-slate-700"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE HORIZONTAL NAVIGATION */}
        <nav aria-label="Mục tài khoản trên điện thoại" className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden border-t border-slate-100 pt-2 text-sm">
          {navItems.map(([label, id]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
              className={`flex shrink-0 items-center px-3 py-2 font-semibold border transition-colors ${
                view === id
                  ? "bg-[#edf3ff] text-[#1947b2] border-[#c9dafb]"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* 3. APPLICATION BODY: SIDEBAR + MAIN AREA */}
      <div className="flex-1 lg:grid lg:grid-cols-[230px_1fr]">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:flex-col justify-between p-4">
          <div>
            <div className="px-2 py-3 border-b border-slate-800">
              <span className="text-xs text-slate-500 block font-semibold">
                Dành cho bạn
              </span>
              <p className="text-sm text-slate-800 font-bold mt-1">Quản lý trợ lý</p>
            </div>

            <nav aria-label="Mục tài khoản" className="mt-4 space-y-1 font-sans text-sm">
              {navItems.map(([label, id]) => {
                const isActive = view === id;
                return (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full flex items-center justify-between p-2.5 font-semibold text-left transition-colors border ${
                      isActive
                        ? "bg-[#edf3ff] text-[#1947b2] border-[#dbe7ff]"
                        : "text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* SIDEBAR FOOTER */}
          <div className="border-t border-slate-800 pt-4 space-y-2 font-mono text-[11px] text-slate-400">
            <div className="p-3 bg-[#f4f7fc] border border-[#dce2e9]">
              <span className="text-xs text-slate-600 block">Lượt chat đã mua</span>
              <b className="text-lg text-slate-900">{(summary.data?.purchased_credits_remaining ?? 0).toLocaleString("vi-VN")}</b>
              <p className="text-xs text-slate-500 mt-1">
                Còn trong ví chung
              </p>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="p-5 lg:p-8 min-w-0">
          {/* =========================================================================
              VIEW: OVERVIEW / DASHBOARD
             ========================================================================= */}
          {view === "overview" && (
            <div className="space-y-8 max-w-7xl mx-auto">
              {summary.isPending && <div className="border border-slate-200 bg-white p-4 text-sm text-slate-600" role="status">Đang tải tổng quan tài khoản...</div>}
              {summary.isError && <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">Không tải được tổng quan tài khoản. Vui lòng thử lại.</div>}
              {/* SECTION 1: WELCOME & TOP ACTIONS */}
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Không gian làm việc
                  </span>
                  <h1 className="mt-1 text-2xl lg:text-3xl font-black font-mono uppercase text-slate-950">
                    Tổng quan
                  </h1>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Những việc quan trọng của trợ lý bán hàng, ở cùng một nơi.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView("ai-workspace")}
                    className="btn-swiss-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
                  >
                    <span>Thử trợ lý AI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("documents")}
                    className="btn-swiss-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
                  >
                    <span>Thêm tài liệu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("payment")}
                    className="btn-swiss-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
                  >
                    <span>Mua thêm lượt</span>
                  </button>
                </div>
              </div>

              {/* SECTION 2: QUOTA MODULE (MANDATORY 20-CELLS DISPLAY) */}
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                {summary.data && <QuotaMeter
                  remaining={summary.data.free_credits_remaining}
                  planName={summary.data?.current_plan ?? "FREE"}
                  onUpgradeClick={() => setView("payment")}
                />}

                {/* VÍ CHUNG & SLOTS CARD */}
                <TechnicalCard strong className="p-5 flex flex-col justify-between bg-white">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-slate-500 uppercase block">
                      Lượt chat đã mua
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <b className="font-mono text-3xl font-black text-[#0052FF]">
                        {(summary.data?.purchased_credits_remaining ?? 0).toLocaleString("vi-VN")}
                      </b>
                      <span className="text-sm text-slate-500">lượt khả dụng</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 font-sans leading-relaxed">
                      Lượt đã mua không bị hết hạn theo ngày. Bạn có thể phân bổ lượt này cho từng chatbot bất kỳ.
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
                    <span>
                      VỊ TRÍ CHATBOT: <b>{summary.data?.chatbot_count ?? 0}/{summary.data?.chatbot_slots ?? 1}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => setView("payment")}
                      className="text-[#0052FF] font-bold hover:underline"
                    >
                      MUA THÊM SLOTS →
                    </button>
                  </div>
                </TechnicalCard>
              </div>

              {/* SECTION 3: KEY METRICS GRID */}
              <div>
                <h3 className="text-lg font-semibold text-[#17233a] mb-4">
                  Hoạt động gần đây
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    ["Chatbot", summary.data?.chatbot_count ?? 0, () => setView("chatbots")],
                    ["Hội thoại", summary.data?.conversation_count ?? 0, () => setView("conversations")],
                    ["Khách hàng mới", summary.data?.new_lead_count ?? 0, () => setView("leads")],
                    ["Tài liệu", summary.data?.document_count ?? 0, () => setView("documents")],
                  ] as Array<[string, number, () => void]>).map(([label, val, act]) => (
                    <TechnicalCard
                      key={label}
                      className="p-5 hover:border-[#2455c7] transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-600">{label}</p>
                      <b className="mt-4 block text-4xl font-bold tracking-tight text-[#17233a]">{val}</b>
                      <button type="button" onClick={act} className="mt-4 text-sm font-semibold text-[#2455c7] hover:underline">Xem chi tiết →</button>
                    </TechnicalCard>
                  ))}
                </div>
              </div>

              {/* SECTION 4: RECENT LEADS & DOCUMENTS SUMMARY */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* RECENT LEADS */}
                <div className="card-swiss p-5 border-slate-200 bg-white">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-semibold text-slate-900">
                        Khách hàng mới ({leads.data?.total ?? 0})
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView("leads")}
                      className="text-xs font-mono text-[#0052FF] font-bold hover:underline"
                    >
                      Xem tất cả →
                    </button>
                  </div>

                  <div className="mt-3 divide-y divide-slate-100 font-sans text-xs">
                    {leads.data?.items.slice(0, 4).map((lead) => (
                      <div key={lead.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <b className="text-slate-900">{lead.customer_name || "Khách ẩn danh"}</b>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {lead.phone || lead.email || "Chưa có thông tin"}
                          </p>
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 border bg-blue-50 text-blue-800 border-blue-200 font-bold">
                          {lead.status}
                        </span>
                      </div>
                    ))}
                    {(!leads.data || leads.data.items.length === 0) && (
                      <p className="py-6 text-center text-slate-400 font-mono text-xs">
                        Chưa có khách hàng tiềm năng nào được ghi nhận.
                      </p>
                    )}
                  </div>
                </div>

                {/* TELEGRAM NOTIFICATION INTEGRATION CARD */}
                <div className="card-swiss p-5 border-slate-200 bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Send size={16} className="text-blue-500" />
                        <h4 className="font-mono text-xs font-black uppercase text-slate-900">
                          TELEGRAM LEAD DELIVERY // THÔNG BÁO TỨC THỜI
                        </h4>
                      </div>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 border font-bold ${
                          telegramStatus.data?.enabled
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-slate-100 text-slate-600 border-slate-300"
                        }`}
                      >
                        {telegramStatus.data?.enabled ? "CONNECTED" : "CHƯA KẾT NỐI"}
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-slate-600 leading-relaxed font-sans">
                      Khi có khách hàng để lại số điện thoại hoặc email trên widget, hệ thống lập tức gửi tin nhắn về Telegram Chat ID của bạn.
                    </p>

                    {telegramStatus.data?.enabled && (
                      <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 font-mono text-xs text-emerald-900">
                        Chat ID: <b>{telegramStatus.data.chat_id_hint}</b> (Đã xác minh)
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 mt-4">
                    <button
                      type="button"
                      onClick={() => setView("settings")}
                      className="btn-swiss-secondary text-xs py-2 w-full font-mono"
                    >
                      {telegramStatus.data?.enabled ? "CẤU HÌNH LẠI TELEGRAM" : "KẾT NỐI TELEGRAM NGAY"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: AI WORKSPACE (INTERACTIVE TESTING WITH RAG SOURCES)
             ========================================================================= */}
          {view === "ai-workspace" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                  Xem trước câu trả lời
                </span>
                <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                  Thử trợ lý AI
                </h2>
                <p className="mt-1 text-xs text-slate-600 font-sans">
                  Đặt câu hỏi như một khách truy cập để xem trợ lý trả lời từ tài liệu đã được phê duyệt.
                </p>
              </div>

              <EnterpriseChatWorkspace
                chatbots={chatbots.data || []}
                organizationId={organizationId}
                onUpgradeClick={() => setView("payment")}
              />
            </div>
          )}

          {/* =========================================================================
              VIEW: CHATBOTS MANAGEMENT
             ========================================================================= */}
          {view === "chatbots" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Trợ lý của bạn
                  </span>
                  <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Chatbot của tôi
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Đã tạo {summary.data?.chatbot_count ?? 0}/{summary.data?.chatbot_slots ?? 1} Chatbot. Còn lại {availableSlots} vị trí khả dụng.
                  </p>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="card-swiss px-3 py-2 bg-white">
                    VÍ CHUNG: <b>{(summary.data?.purchased_credits_remaining ?? 0).toLocaleString("vi-VN")}</b> LƯỢT
                  </span>
                </div>
              </div>

              {/* CREATE NEW BOT FORM */}
              <div className="card-swiss p-5 border-slate-300 bg-white">
                <h3 className="font-mono text-xs font-black uppercase text-slate-900 mb-3">
                  Tạo chatbot mới
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim()) createChatbot.mutate(name.trim());
                  }}
                  className="flex flex-wrap gap-3"
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nhập tên trợ lý (VD: Trợ lý Bán hàng Thiết bị điện)..."
                    className="input-swiss text-xs font-sans flex-1 min-w-[240px]"
                  />
                  <button
                    type="submit"
                    disabled={createChatbot.isPending || name.trim().length < 2 || availableSlots === 0}
                    className="btn-swiss-primary text-xs py-2 px-5 font-mono inline-flex items-center gap-1.5"
                  >
                    <Plus size={15} />
                    <span>{createChatbot.isPending ? "ĐANG TẠO..." : "TẠO CHATBOT"}</span>
                  </button>
                </form>

                {availableSlots === 0 && (
                  <p className="mt-2.5 text-xs text-amber-800 font-mono">
                    * Bạn đã sử dụng hết {summary.data?.chatbot_slots} vị trí chatbot được cấp. Bạn có thể xóa bot không dùng hoặc vào mục Gói & Thanh toán để mua thêm vị trí.
                  </p>
                )}
                {createChatbot.isError && (
                  <p className="mt-2 text-xs text-red-600 font-mono">
                    LỖI: {createChatbot.error.message}
                  </p>
                )}
              </div>

              {/* CHATBOTS LIST */}
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {chatbots.data?.map((bot) => {
                  const embedScript = `<script src="${window.location.origin}/widget.js" data-chatbot-id="${bot.public_id}" async></script>`;
                  return (
                    <TechnicalCard key={bot.id} className="p-5 flex flex-col justify-between bg-white">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className="w-8 h-8 border border-slate-200"
                            style={{ backgroundColor: bot.primary_color || "#0052FF" }}
                            aria-hidden="true"
                          />
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 border font-bold ${
                              bot.is_active
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : "bg-slate-100 text-slate-600 border-slate-300"
                            }`}
                          >
                            {bot.is_active ? "ĐANG HOẠT ĐỘNG" : "ĐÃ TẮT"}
                          </span>
                        </div>

                        <h3 className="mt-3 font-black text-sm text-slate-900 font-sans">{bot.name}</h3>
                        <p className="mt-1 text-xs text-slate-500 font-sans line-clamp-2">{bot.greeting}</p>

                        <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 p-2.5 font-mono text-[11px] border border-slate-200">
                          <div>
                             <span className="text-slate-500 block text-[10px]">LƯỢT CÒN LẠI</span>
                            <b className="text-slate-900">{bot.credit_balance.toLocaleString("vi-VN")}</b>
                          </div>
                          <div>
                             <span className="text-slate-500 block text-[10px]">ĐÃ SỬ DỤNG</span>
                            <b className="text-slate-900">{bot.usage_count.toLocaleString("vi-VN")}</b>
                          </div>
                        </div>

                        {/* CREDITS ALLOCATION */}
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                             Chuyển lượt từ ví chung
                          </span>
                          <ChatbotCreditControls
                            balance={bot.credit_balance}
                            wallet={summary.data?.purchased_credits_remaining ?? 0}
                            pending={allocateCredits.isPending}
                            onAllocate={(amount) => allocateCredits.mutateAsync({ id: bot.id, amount })}
                          />
                        </div>

                        {/* SCRIPT TAG */}
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold mb-1">
                             Mã nhúng vào website
                          </span>
                          <code className="block bg-slate-950 text-slate-200 p-2 font-mono text-[10px] break-all select-all">
                            {embedScript}
                          </code>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(embedScript);
                            setCopiedBotId(bot.id);
                            window.setTimeout(() => setCopiedBotId(""), 2000);
                          }}
                           className="btn-swiss-secondary text-xs py-1.5 px-3"
                         >
                           {copiedBotId === bot.id ? "Đã sao chép" : "Sao chép mã nhúng"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Xóa chatbot "${bot.name}"? Số lượt còn lại sẽ hoàn về ví chung.`)) {
                              deleteChatbot.mutate(bot.id);
                            }
                          }}
                           className="btn-swiss-danger text-xs py-1.5 px-2.5"
                           aria-label={`Xóa chatbot ${bot.name}`}
                         >
                           Xóa chatbot
                        </button>
                      </div>
                    </TechnicalCard>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: KNOWLEDGE BASE (DOCUMENTS)
             ========================================================================= */}
          {view === "documents" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Kho nội dung
                  </span>
                  <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Tài liệu của bạn
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Định dạng hỗ trợ: PDF, DOCX, XLSX (tối đa 25MB). Tài liệu cần được phê duyệt trước khi chatbot sử dụng.
                  </p>
                </div>
              </div>

              {/* UPLOAD DRAG & DROP ZONE - ZERO ROUNDING */}
              <div
                className="card-swiss border-2 border-dashed border-slate-300 p-8 text-center bg-white hover:border-[#0052FF] transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!uploadDoc.isPending && e.dataTransfer.files[0]) uploadDoc.mutate(e.dataTransfer.files[0]);
                }}
              >
                <FileText size={36} className="mx-auto text-slate-400 mb-3" />
                <h3 className="font-mono text-sm font-black uppercase text-slate-900">
                  KÉO THẢ TỆP HOẶC CHỌN TỪ THIẾT BỊ
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-1">
                  PDF, Word (.docx) hoặc Excel (.xlsx) chứa thông tin sản phẩm, chính sách giá và thông số kỹ thuật.
                </p>

                <div className="mt-4">
                  <label className="btn-swiss-primary cursor-pointer text-xs py-2.5 px-5 font-mono inline-flex items-center gap-2">
                    <Upload size={14} />
                    <span>{uploadDoc.isPending ? "ĐANG TẢI & BÓC TÁCH..." : "CHỌN TỆP TẢI LÊN"}</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.xlsx"
                      className="hidden"
                      disabled={uploadDoc.isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDoc.mutate(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {uploadDoc.isPending && <p className="mt-3 text-sm text-slate-600" role="status">Đang tải tệp lên, vui lòng chờ...</p>}
                {uploadDoc.isSuccess && <p className="mt-3 text-sm text-emerald-700" role="status">Tải lên thành công. Tài liệu sẽ được xử lý và duyệt trước khi chatbot sử dụng.</p>}
                {uploadDoc.isError && (
                  <p className="mt-3 text-sm text-red-700" role="alert">
                    Không tải được tệp: {uploadDoc.error.message}
                  </p>
                )}
              </div>

              {/* DOCUMENTS TABLE */}
              <div className="card-swiss-strong overflow-hidden bg-white">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-mono text-xs font-black uppercase text-slate-900">
                    DANH SÁCH TÀI LIỆU ĐÃ TẢI LÊN ({documents.data?.length ?? 0})
                  </h3>
                  <span className="font-mono text-[10px] text-slate-500">
                    TỰ ĐỘNG LẬP CHỈ MỤC THEO ĐOẠN NGỮ CẢNH
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-100 font-mono text-[10px] uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">TÊN TỆP</th>
                        <th className="p-3.5">DUNG LƯỢNG</th>
                        <th className="p-3.5">XỬ LÝ DỮ LIỆU</th>
                        <th className="p-3.5">PHÊ DUYỆT BỞI AI / ADMIN</th>
                        <th className="p-3.5">NGÀY TẢI LÊN</th>
                        <th className="p-3.5 text-right">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {documents.data?.map((doc) => {
                        const isDone = doc.status === "DONE";
                        const isApproved = doc.approval_status === "APPROVED";
                        const isFailed = doc.status === "FAILED";

                        return (
                          <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3.5 font-bold text-slate-900 font-sans max-w-xs truncate">
                              <span className="flex items-center gap-2">
                                <FileText size={15} className="text-[#0052FF] shrink-0" />
                                <span className="truncate">{doc.original_name}</span>
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-600">
                              {(doc.size_bytes / 1024).toFixed(1)} KB
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`text-[10px] px-2 py-0.5 border font-bold ${
                                  isDone
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                    : isFailed
                                    ? "bg-red-50 text-red-800 border-red-300"
                                    : "bg-blue-50 text-blue-800 border-blue-200"
                                }`}
                              >
                                {doc.status === "DONE" ? "Đã xử lý" : doc.status === "FAILED" ? "Xử lý lỗi" : doc.status === "PROCESSING" ? "Đang xử lý" : "Đã tải lên"}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`text-[10px] px-2 py-0.5 border font-bold ${
                                  isApproved
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                    : doc.approval_status === "REJECTED"
                                    ? "bg-red-50 text-red-800 border-red-300"
                                    : "bg-amber-50 text-amber-800 border-amber-300"
                                }`}
                              >
                                {isApproved ? "Đã duyệt · Sẵn sàng" : doc.approval_status === "REJECTED" ? "Bị từ chối" : "Chờ duyệt"}
                              </span>
                              {doc.ai_review && (
                                <span className="ml-2 text-[10px] text-slate-500 font-mono">
                                  [SCORE: {doc.ai_review.score}/100]
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-slate-500 text-[11px]">
                              {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                            </td>
                            <td className="p-3.5 text-right space-x-2">
                              {isDone && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDocId(doc.id)}
                                  className="btn-swiss-secondary text-[11px] py-1 px-2.5 inline-flex items-center gap-1"
                                >
                                  <Eye size={12} />
                                  <span>XEM TEXT</span>
                                </button>
                              )}

                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={() => retryDoc.mutate(doc.id)}
                                  className="btn-swiss-secondary text-[11px] py-1 px-2.5 text-blue-700"
                                >
                                  THỬ LẠI
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Xóa tài liệu "${doc.original_name}" khỏi kho tri thức?`)) {
                                    deleteDoc.mutate(doc.id);
                                  }
                                }}
                                className="btn-swiss-danger text-[11px] py-1 px-2"
                                title="Xóa tài liệu này"
                                aria-label={`Xóa tài liệu ${doc.original_name}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {documents.isPending && <div className="p-8 text-center text-sm text-slate-600" role="status">Đang tải tài liệu...</div>}
                  {documents.isError && <div className="p-8 text-center text-sm text-red-700" role="alert">Không tải được danh sách tài liệu. Vui lòng thử lại.</div>}
                  {documents.isSuccess && documents.data.length === 0 && (
                    <div className="p-12 text-center text-slate-400 font-mono text-xs">
                      CHƯA CÓ TÀI LIỆU NÀO. HÃY TẢI TỆP ĐẦU TIÊN ĐỂ BỔ SUNG KIẾN THỨC CHO TRỢ LÝ.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: CONVERSATIONS HISTORY
             ========================================================================= */}
          {view === "conversations" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Lắng nghe khách hàng
                  </span>
                  <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Hội thoại khách hàng
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Tìm kiếm và xem từng trang hội thoại giữa khách truy cập và trợ lý AI.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {conversations.isPending && <div className="card-swiss p-8 text-center text-sm text-slate-600" role="status">Đang tải hội thoại...</div>}
                {conversations.isError && <div className="card-swiss p-8 text-center text-sm text-red-700" role="alert">Không tải được hội thoại. Vui lòng thử lại.</div>}
                {conversations.data?.items.map((item) => {
                  const isOpened = selectedConversationId === item.id;
                  return (
                    <div key={item.id} className="card-swiss p-5 border-slate-300 bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <b className="text-slate-900 font-sans">{item.chatbot_name}</b>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-500">
                              {new Date(item.created_at).toLocaleString("vi-VN")}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-sans text-slate-700">
                            <span className="font-bold text-slate-900 font-mono">CÂU HỎI ĐẦU TIÊN:</span>{" "}
                            {item.first_question || "Khách chưa nhập tin nhắn"}
                          </p>
                          <p className="mt-1 text-[10px] font-mono text-slate-400 select-all">
                            CONVERSATION ID: {item.id}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedConversationId(isOpened ? null : item.id)}
                          className="btn-swiss-secondary text-xs py-1.5 px-3 font-mono"
                        >
                          {isOpened ? "ẨN TIN NHẮN" : "XEM CHI TIẾT"}
                        </button>
                      </div>

                      {/* CONVERSATION MESSAGES ACCORDION */}
                      {isOpened && (
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 bg-slate-50 p-4">
                          {conversationDetail.isLoading && (
                            <p className="text-xs font-mono text-slate-500">Đang tải lịch sử tin nhắn...</p>
                          )}
                          {conversationDetail.isError && <p className="text-sm text-red-700" role="alert">Không tải được tin nhắn của cuộc hội thoại này.</p>}
                          {conversationDetail.data?.messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-3 text-xs leading-relaxed ${
                                msg.role === "USER"
                                  ? "bg-white border border-slate-300 text-slate-900"
                                  : "chat-ai-message text-slate-900"
                              }`}
                            >
                              <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-1">
                                <b className="text-slate-700">{msg.role === "USER" ? "KHÁCH HÀNG" : "TRỢ LÝ ẢO"}</b>
                                <span>{new Date(msg.created_at).toLocaleTimeString("vi-VN", { hour12: false })}</span>
                              </div>
                              <p className="font-sans whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {conversations.isSuccess && conversations.data.total === 0 && (
                  <div className="card-swiss p-12 text-center text-slate-400 font-mono text-xs">
                    {searchTerm ? "KHÔNG TÌM THẤY HỘI THOẠI PHÙ HỢP." : "CHƯA CÓ CUỘC HỘI THOẠI NÀO TỪ KHÁCH TRUY CẬP."}
                  </div>
                )}
              </div>
              {conversations.data && <PageControls page={conversationPage} pageSize={conversations.data.page_size} total={conversations.data.total} onPageChange={(page) => { setConversationPage(page); setSelectedConversationId(null); }} />}
            </div>
          )}

          {/* =========================================================================
              VIEW: LEADS CRM
             ========================================================================= */}
          {view === "leads" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Khách muốn được tư vấn
                  </span>
                  <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Khách hàng tiềm năng
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Thông tin do khách hàng tự nguyện để lại qua widget chat để yêu cầu tư vấn báo giá.
                  </p>
                </div>

                <span className="font-mono text-xs bg-white border border-slate-300 px-3 py-1.5">
                  TỔNG CỘNG: <b>{leads.data?.total ?? 0}</b> LEADS
                </span>
              </div>

              <div className="card-swiss-strong overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-100 font-mono text-[10px] uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">TÊN KHÁCH</th>
                        <th className="p-3.5">LIÊN HỆ</th>
                        <th className="p-3.5">NHU CẦU / Ý ĐỊNH</th>
                        <th className="p-3.5">TRẠNG THÁI</th>
                        <th className="p-3.5">THỜI GIAN</th>
                        <th className="p-3.5 text-right">CẬP NHẬT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leads.data?.items.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-950">
                            {lead.customer_name || "Khách chưa đặt tên"}
                          </td>
                          <td className="p-3.5 font-mono text-slate-700">
                            <div>{lead.phone || "—"}</div>
                            <div className="text-[11px] text-slate-400">{lead.email || ""}</div>
                          </td>
                          <td className="p-3.5 max-w-xs text-slate-600 truncate">
                            {lead.intent_summary || "Chưa có tóm tắt"}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`font-mono text-[10px] px-2 py-0.5 border font-bold ${
                                lead.status === "NEW"
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : lead.status === "QUALIFIED"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : lead.status === "CLOSED"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-slate-100 text-slate-600 border-slate-300"
                              }`}
                            >
                              {lead.status}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-slate-500">
                            {new Date(lead.created_at).toLocaleString("vi-VN")}
                          </td>
                          <td className="p-3.5 text-right">
                            <select
                              value={lead.status}
                              onChange={(e) =>
                                updateLead.mutate({
                                  id: lead.id,
                                  status: e.target.value as Lead["status"],
                                })
                              }
                              className="input-swiss text-xs font-mono py-1 px-2 w-auto bg-white font-bold"
                            >
                              <option value="NEW">MỚI (NEW)</option>
                              <option value="CONTACTED">ĐÃ LIÊN HỆ</option>
                              <option value="QUALIFIED">TIỀM NĂNG</option>
                              <option value="CLOSED">ĐÃ CHỐT ĐƠN</option>
                              <option value="LOST">KHÔNG THÀNH CÔNG</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {leads.isPending && <div className="p-8 text-center text-sm text-slate-600" role="status">Đang tải khách hàng...</div>}
                  {leads.isError && <div className="p-8 text-center text-sm text-red-700" role="alert">Không tải được danh sách khách hàng. Vui lòng thử lại.</div>}
                  {leads.isSuccess && leads.data.items.length === 0 && (
                    <div className="p-12 text-center text-slate-400 font-mono text-xs">
                      {searchTerm ? "KHÔNG TÌM THẤY KHÁCH HÀNG PHÙ HỢP." : "CHƯA CÓ KHÁCH HÀNG NÀO ĐỂ LẠI THÔNG TIN."}
                    </div>
                  )}
                </div>
              </div>
              {leads.data && <PageControls page={leadPage} pageSize={leads.data.page_size} total={leads.data.total} onPageChange={setLeadPage} />}
            </div>
          )}

          {/* =========================================================================
              VIEW: BILLING & PRICING & VIETQR
             ========================================================================= */}
          {view === "payment" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="border-b border-slate-200 pb-5">
                <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                  Lượt chat và gói dịch vụ
                </span>
                <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                  Thanh toán
                </h2>
                <p className="mt-1 text-xs text-slate-600 font-sans">
                  Mua thêm vị trí Chatbot hoặc gói lượt chat vĩnh viễn. Thanh toán tự động quét mã VietQR.
                </p>
              </div>

              {/* CURRENT BALANCE OVERVIEW */}
              <div className="grid gap-4 sm:grid-cols-3 font-mono">
                <div className="card-swiss p-5 bg-white border-slate-300">
                  <span className="text-sm text-slate-600 block">Lượt miễn phí còn lại</span>
                  <b className="text-2xl text-slate-950 mt-1 block">
                    {(balance.data?.free_remaining ?? 0).toLocaleString("vi-VN")}
                  </b>
                  <p className="text-xs text-slate-500 mt-1">Không tự làm mới hằng ngày</p>
                </div>

                <div className="card-swiss p-5 bg-white border-slate-300">
                  <span className="text-[10px] text-slate-500 uppercase block">VÍ LƯỢT ĐÃ MUA (VĨNH VIỄN)</span>
                  <b className="text-2xl text-[#0052FF] mt-1 block">
                    {(balance.data?.purchased_remaining ?? 0).toLocaleString("vi-VN")}
                  </b>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">Dùng chung hoặc phân bổ cho bot</p>
                </div>

                <div className="card-swiss p-5 bg-white border-slate-300">
                  <span className="text-[10px] text-slate-500 uppercase block">VỊ TRÍ CHATBOT</span>
                  <b className="text-2xl text-slate-950 mt-1 block">
                    {balance.data?.chatbot_count ?? 0}/{balance.data?.chatbot_slots ?? 1}
                  </b>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">Số bot tối đa được phép tạo</p>
                </div>
              </div>

              {/* PRODUCTS LIST */}
              <div>
                <h3 className="font-mono text-xs font-black uppercase text-slate-900 mb-3">
                  CHỌN GÓI DỊCH VỤ ĐỂ MUA
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {products.data?.map((prod) => (
                    <TechnicalCard
                      key={prod.code}
                      className="p-5 flex flex-col justify-between hover:border-[#0052FF] transition-colors bg-white"
                    >
                      <div>
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span className="font-bold text-slate-500 uppercase">{prod.code}</span>
                          <span className="bg-blue-50 text-blue-800 px-1.5 py-0.2 border border-blue-200">
                            {prod.product_type === "CHATBOT_SLOT" ? "SLOT BOT" : "LƯỢT CHAT"}
                          </span>
                        </div>
                        <h4 className="mt-2 font-black text-sm text-slate-950 font-sans">{prod.name}</h4>
                        <p className="mt-1 text-xs text-slate-600 font-sans">{prod.description}</p>
                        <div className="mt-4 font-mono text-2xl font-black text-[#0052FF]">
                          {prod.price_vnd.toLocaleString("vi-VN")} ₫
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setCheckoutProduct(prod)}
                          className="btn-swiss-primary w-full text-xs py-2.5 font-mono inline-flex items-center justify-center gap-2"
                        >
                          <QrCode size={14} />
                          <span>QUÉT MÃ VIETQR</span>
                        </button>
                      </div>
                    </TechnicalCard>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: CUSTOMER SUPPORT TICKETS
             ========================================================================= */}
          {view === "support" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Chúng tôi ở đây để hỗ trợ
                  </span>
                  <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Hỗ trợ
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 font-sans">
                    Gửi yêu cầu hỗ trợ trực tiếp đến ban quản trị hệ thống, kèm ảnh và tệp đính kèm.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateTicket(!showCreateTicket)}
                  className="btn-swiss-primary text-xs py-2 px-4 font-mono"
                >
                  {showCreateTicket ? "Đóng biểu mẫu" : "Tạo yêu cầu hỗ trợ"}
                </button>
              </div>

              {/* CREATE TICKET ACCORDION */}
              {showCreateTicket && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ticketSubject.trim() && ticketMessage.trim()) createTicket.mutate();
                  }}
                  className="card-swiss-strong p-6 border-slate-900 bg-white space-y-4 max-w-2xl"
                >
                  <h3 className="font-mono text-xs font-black uppercase text-slate-900">
                    YÊU CẦU HỖ TRỢ MỚI
                  </h3>
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      TIÊU ĐỀ YÊU CẦU
                    </label>
                    <input
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="VD: Cần hỗ trợ nạp thêm tài liệu bảng giá..."
                      maxLength={200}
                      className="input-swiss text-xs font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      CHI TIẾT VẤN ĐỀ CẦN HỖ TRỢ
                    </label>
                    <textarea
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      rows={4}
                      maxLength={5000}
                      placeholder="Mô tả cụ thể vấn đề hoặc kèm mã Request ID..."
                      className="input-swiss text-xs font-sans resize-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <label className="btn-swiss-secondary cursor-pointer text-xs py-2 px-3 font-mono inline-flex items-center gap-1.5">
                      <Paperclip size={13} />
                      <span>ĐÍNH KÈM TỆP</span>
                      <input
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
                        className="hidden"
                        onChange={(e) => {
                          setTicketCreateFiles(Array.from(e.target.files ?? []).slice(0, 5));
                          e.target.value = "";
                        }}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={createTicket.isPending || ticketSubject.trim().length < 3 || ticketMessage.trim().length < 5}
                      className="btn-swiss-primary text-xs py-2 px-5 font-mono"
                    >
                      {createTicket.isPending ? "ĐANG GỬI..." : "GỬI TICKET HỖ TRỢ"}
                    </button>

                    {ticketCreateFiles.map((f) => (
                      <span key={f.name} className="text-[11px] font-mono bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5">
                        {f.name}
                      </span>
                    ))}
                  </div>

                  {createTicket.isError && (
                    <p className="text-xs text-red-600 font-mono">
                      LỖI GỬI TICKET: {createTicket.error.message}
                    </p>
                  )}
                </form>
              )}

              <TicketChat
                tickets={tickets.data}
                selectedId={selectedTicketId}
                viewer="CUSTOMER"
                reply={ticketReply}
                files={ticketReplyFiles}
                sending={replyTicket.isPending}
                onSelect={(t) => {
                  setSelectedTicketId(t.id);
                  if (t.customer_unread_count > 0) markTicketRead.mutate(t.id);
                }}
                onReplyChange={setTicketReply}
                onFilesChange={setTicketReplyFiles}
                onSend={(t) => replyTicket.mutate(t)}
              />
            </div>
          )}

          {/* =========================================================================
              VIEW: SETTINGS & TELEGRAM
             ========================================================================= */}
          {view === "settings" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="border-b border-slate-200 pb-5">
                <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                    Tùy chỉnh không gian làm việc
                </span>
                <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                    Cài đặt và kết nối
                </h2>
                <p className="mt-1 text-xs text-slate-600 font-sans">
                  Thiết lập thông báo tự động về Telegram khi có khách hàng tiềm năng mới.
                </p>
              </div>

              {/* TELEGRAM SETUP */}
              <TechnicalCard strong className="p-6 bg-white max-w-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Send size={18} className="text-blue-500" />
                    <h3 className="font-mono text-xs font-black uppercase text-slate-900">
                      Nhận thông báo khách hàng qua Telegram
                    </h3>
                  </div>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 border font-bold ${
                      telegramStatus.data?.enabled
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-slate-100 text-slate-600 border-slate-300"
                    }`}
                  >
                    {telegramStatus.data?.enabled ? "ĐÃ KÍCH HOẠT" : "CHƯA KẾT NỐI"}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-sans">
                  Nhập Telegram Chat ID của bạn để nhận thông báo tức thì khi có khách mua để lại liên hệ trên widget.
                </p>

                {telegramStatus.data?.enabled && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 font-mono text-xs text-emerald-900 flex items-center justify-between">
                    <span>
                      ĐÃ XÁC MINH CHAT ID: <b>{telegramStatus.data.chat_id_hint}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => disableTelegram.mutate()}
                      disabled={disableTelegram.isPending}
                      className="text-red-700 underline font-bold"
                    >
                      HỦY LIÊN KẾT
                    </button>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <span className="font-mono text-[10px] text-slate-500 uppercase block font-bold">
                    BƯỚC 1: GỬI MÃ XÁC MINH
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Nhập Telegram Chat ID (VD: 123456789)..."
                      className="input-swiss text-xs font-mono flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => telegramChallenge.mutate()}
                      disabled={!telegramChatId.trim() || telegramChallenge.isPending}
                      className="btn-swiss-secondary text-xs py-2 px-4 font-mono shrink-0"
                    >
                      {telegramChallenge.isPending ? "ĐANG GỬI..." : "GỬI MÃ"}
                    </button>
                  </div>

                  {telegramChallenge.isSuccess && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <span className="font-mono text-[10px] text-emerald-700 uppercase block font-bold">
                        BƯỚC 2: NHẬP MÃ 6 CHỮ SỐ ĐÃ NHẬN TRÊN TELEGRAM
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={telegramCode}
                          onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="Mã xác thực 6 số (VD: 849201)..."
                          className="input-swiss text-xs font-mono flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => telegramConfirm.mutate()}
                          disabled={telegramCode.length !== 6 || telegramConfirm.isPending}
                          className="btn-swiss-primary text-xs py-2 px-4 font-mono shrink-0"
                        >
                          {telegramConfirm.isPending ? "ĐANG XÁC NHẬN..." : "XÁC NHẬN"}
                        </button>
                      </div>
                    </div>
                  )}

                  {(telegramChallenge.isError || telegramConfirm.isError) && (
                    <p className="text-xs text-red-600 font-mono">
                      LỖI: {telegramChallenge.error?.message || telegramConfirm.error?.message}
                    </p>
                  )}
                </div>
              </TechnicalCard>
            </div>
          )}

          {/* =========================================================================
              VIEW: OBSERVABILITY & TRACE
             ========================================================================= */}
          {view === "observability" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="border-b border-slate-200 pb-5">
                <span className="font-mono text-xs font-bold text-[#0052FF] uppercase tracking-wider block">
                  Dành cho kiểm tra kỹ thuật
                </span>
                <h2 className="mt-1 text-2xl font-black font-mono uppercase text-slate-950">
                  Nhật ký hệ thống
                </h2>
                <p className="mt-1 text-xs text-slate-600 font-sans">
                  Công cụ hỗ trợ thuyết trình và gỡ lỗi sự cố trong quá trình kiểm thử hoặc bảo vệ đồ án.
                </p>
              </div>

              <TopStatusBar />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setShowArchModal(true)} className="btn-swiss-secondary">Xem kiến trúc đồ án</button>
                <a href="/docs" target="_blank" rel="noreferrer" className="btn-swiss-secondary">Mở tài liệu API</a>
              </div>

              <RequestIdHelper />
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      <DocumentPreviewModal
        documentId={previewDocId}
        onClose={() => setPreviewDocId(null)}
      />

      <PaymentModal
        key={checkoutProduct?.code ?? "closed"}
        product={checkoutProduct}
        onClose={() => setCheckoutProduct(null)}
      />

      <SystemArchitectureModal
        isOpen={showArchModal}
        onClose={() => setShowArchModal(false)}
      />
    </div>
  );
}
