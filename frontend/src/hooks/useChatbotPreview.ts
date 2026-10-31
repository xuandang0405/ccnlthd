import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getLastRequestId } from "../services/api";
import { pendingChatMessage, postChatMessage, type PendingChatMessage } from "../services/chatRetry";
import type { Chatbot } from "../types";

type SourceRef = {
  document_id: string;
  document_name: string;
};

type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  created_at: string;
  sources?: SourceRef[];
  requestId?: string | null;
};

type VisitorSession = {
  visitor_token: string;
  conversation_id: string;
  greeting: string;
  primary_color: string;
  expires_at: string;
};

type PublicChatResponse = {
  reply: string;
  conversation_id: string;
  remaining_daily: number | null;
  remaining_credits: number;
  sources: SourceRef[];
};

export function useChatbotPreview(chatbots: Chatbot[], organizationId: string) {
  const queryClient = useQueryClient();
  const [selectedBotId, setSelectedBotId] = useState<string>(chatbots[0]?.id || "");
  const [session, setSession] = useState<VisitorSession | null>(null);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<{
    status?: number;
    message: string;
    requestId?: string | null;
    retryAfter?: string | null;
  } | null>(null);
  const [activeSources, setActiveSources] = useState<SourceRef[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingMessage = useRef<PendingChatMessage | null>(null);

  const activeBot = chatbots.find((b) => b.id === selectedBotId) || chatbots[0];
  const activeBotId = activeBot?.id;
  const activeBotPublicId = activeBot?.public_id;
  const activeBotGreeting = activeBot?.greeting;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Mỗi chatbot dùng phiên riêng để không mang tin nhắn và nguồn của bot trước sang.
  useEffect(() => {
    if (!activeBotPublicId) return;
    let active = true;
    setSession(null);
    setMessages([]);
    setChatError(null);
    setActiveSources([]);
    pendingMessage.current = null;

    async function initSession() {
      try {
        const res = await fetch(`/api/v1/public/chat/${activeBotPublicId}/sessions`, {
          method: "POST",
          headers: { "X-Widget-Origin": window.location.origin },
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Không thể khởi tạo phiên trò chuyện");
        }
        const data: VisitorSession = await res.json();
        if (!active) return;
        setSession(data);
        setMessages([
          {
            id: `msg-greet-${Date.now()}`,
            role: "ASSISTANT",
            content: data.greeting || activeBotGreeting || "Xin chào! Tôi là trợ lý AI.",
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        if (!active) return;
        setChatError({
          message: err instanceof Error ? err.message : "Lỗi kết nối phiên làm việc",
        });
      }
    }

    initSession();
    return () => {
      active = false;
    };
  }, [activeBotId, activeBotPublicId, activeBotGreeting]);

  async function handleSendMessage() {
    const text = inputMessage.trim();
    if (!text || !activeBot || !session || isSending) return;

    const userMsg: WorkspaceMessage = {
      id: `msg-user-${Date.now()}`,
      role: "USER",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsSending(true);
    setChatError(null);
    try {
      pendingMessage.current = pendingChatMessage(pendingMessage.current, text, session.visitor_token);
      const response = await postChatMessage(
        `/api/v1/public/chat/${activeBot.public_id}/messages`, pendingMessage.current
      );

      const reqId = response.headers.get("X-Request-ID") || getLastRequestId();
      const retryAfter = response.headers.get("Retry-After");

      if (!response.ok) {
        let errMessage = "Yêu cầu không thành công";
        if (response.status === 429) {
          errMessage = "Bạn đang gửi tin quá nhanh. Vui lòng đợi một chút rồi thử lại.";
        } else if (response.status === 402) {
          errMessage = "Số lượt chat đã hết. Vui lòng nạp thêm lượt dùng để tiếp tục.";
        } else if (response.status === 401) {
          errMessage = "Phiên làm việc đã hết hạn. Hãy làm mới phiên.";
        } else if (response.status === 422) {
          errMessage = "Nội dung tin nhắn không hợp lệ. Vui lòng kiểm tra lại.";
        }
        const payload = await response.json().catch(() => ({}));
        if (payload.detail) {
          errMessage = typeof payload.detail === "string" ? payload.detail : errMessage;
        }

        setChatError({
          status: response.status,
          message: errMessage,
          requestId: reqId,
          retryAfter,
        });

        setMessages((prev) => prev.filter((message) => message.id !== userMsg.id));
        setInputMessage(text);
        return;
      }

      const data: PublicChatResponse = await response.json();
      pendingMessage.current = null;
      const assistantMsg: WorkspaceMessage = {
        id: `msg-ai-${Date.now()}`,
        role: "ASSISTANT",
        content: data.reply,
        created_at: new Date().toISOString(),
        sources: data.sources || [],
        requestId: reqId,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setActiveSources(data.sources || []);

      queryClient.invalidateQueries({ queryKey: ["dashboard", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["chatbots", organizationId] });
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== userMsg.id));
      setChatError({
        message: err instanceof Error ? err.message : "Lỗi kết nối máy chủ",
        requestId: getLastRequestId(),
      });
      setInputMessage(text);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  return {
    activeBot,
    setSelectedBotId,
    session,
    messages,
    setMessages,
    inputMessage,
    setInputMessage,
    isSending,
    chatError,
    setChatError,
    activeSources,
    messagesEndRef,
    textareaRef,
    handleSendMessage,
    handleKeyDown,
  };
}
