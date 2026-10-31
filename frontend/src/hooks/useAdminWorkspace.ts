import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { adminNavigation, type AdminSection as Section } from "../config/site";
import { api, uploadApi } from "../services/api";
import type { AdminAuditEvent, AdminChatbot, AdminDocument, AdminOrganization, AdminPayment, AdminSummary, AdminUser, ModerationSettings, SupportTicket } from "../types";

export function useAdminWorkspace() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const section: Section = adminNavigation.find((item) => item.id === requestedSection)?.id ?? "overview";
  const setSection = (next: Section) => setSearchParams(next === "overview" ? {} : { section: next });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFiles, setTicketFiles] = useState<File[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [chatbotSearch, setChatbotSearch] = useState("");
  const [documentFilter, setDocumentFilter] = useState<"PENDING" | "ALL">("PENDING");

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

  const metricCards = summary.data
    ? [
      ["Doanh nghiệp", summary.data.organizations, "organizations"],
      ["Người dùng", summary.data.users, "users"],
      ["Chatbot", summary.data.chatbots, "chatbots"],
      ["Hội thoại", summary.data.conversations, null],
      ["Khách hàng tiềm năng", summary.data.leads, null],
    ] as Array<[string, number, Section | null]>
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
                  : auditLogs;

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

  return {
    user,
    logout,
    section,
    setSection,
    selectedTicketId,
    setSelectedTicketId,
    ticketReply,
    setTicketReply,
    ticketFiles,
    setTicketFiles,
    userSearch,
    setUserSearch,
    chatbotSearch,
    setChatbotSearch,
    documentFilter,
    setDocumentFilter,
    summary,
    organizations,
    users,
    chatbots,
    documents,
    tickets,
    payments,
    moderation,
    auditLogs,
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
    markTicketReadAdmin,
    metricCards,
    activeQuery,
    actionError,
  };
}

export type AdminWorkspace = ReturnType<typeof useAdminWorkspace>;
