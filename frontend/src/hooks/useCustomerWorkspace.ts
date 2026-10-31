import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { customerNavigation, type CustomerView as View } from "../config/site";
import { api, uploadApi } from "../services/api";
import type { Chatbot, Conversation, ConversationDetail, CreditBalance, DashboardSummary, DocumentItem, Lead, Page, PaymentProduct, SupportTicket } from "../types";

export function useCustomerWorkspace() {
  const { user, organizationId, logout } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: View = customerNavigation.find((item) => item.id === requestedView)?.id ?? "overview";
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
    refetchInterval: 15000,
  });

  const newLeads = useQuery({
    queryKey: ["new-leads", organizationId],
    queryFn: () => api<Page<Lead>>("/leads?status=NEW&page=1&page_size=5"),
    enabled: !!organizationId && view === "settings",
    refetchInterval: 15000,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["new-leads", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
    },
  });

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

  const currentOrg = user?.organizations.find((o) => o.id === organizationId);
  const availableSlots = Math.max(
    0,
    (summary.data?.chatbot_slots ?? 1) - (summary.data?.chatbot_count ?? 0)
  );
  const pendingDocumentCount = documents.data?.filter(
    (document) => document.status === "DONE" && document.approval_status === "PENDING"
  ).length ?? 0;

  return {
    user,
    organizationId,
    logout,
    view,
    setView,
    globalSearch,
    setGlobalSearch,
    searchTerm,
    conversationPage,
    setConversationPage,
    leadPage,
    setLeadPage,
    name,
    setName,
    copiedBotId,
    setCopiedBotId,
    selectedConversationId,
    setSelectedConversationId,
    previewDocId,
    setPreviewDocId,
    checkoutProduct,
    setCheckoutProduct,
    showArchModal,
    setShowArchModal,
    ticketSubject,
    setTicketSubject,
    ticketMessage,
    setTicketMessage,
    ticketCreateFiles,
    setTicketCreateFiles,
    selectedTicketId,
    setSelectedTicketId,
    ticketReply,
    setTicketReply,
    ticketReplyFiles,
    setTicketReplyFiles,
    showCreateTicket,
    setShowCreateTicket,
    summary,
    chatbots,
    documents,
    conversations,
    conversationDetail,
    leads,
    newLeads,
    products,
    balance,
    tickets,
    createChatbot,
    allocateCredits,
    deleteChatbot,
    uploadDoc,
    retryDoc,
    deleteDoc,
    updateLead,
    createTicket,
    replyTicket,
    markTicketRead,
    currentOrg,
    availableSlots,
    pendingDocumentCount,
  };
}

export type CustomerWorkspace = ReturnType<typeof useCustomerWorkspace>;
