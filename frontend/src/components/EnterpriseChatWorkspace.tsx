import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getLastRequestId } from "../services/api";
import type { Chatbot } from "../types";
import { RequestIdDisplay } from "./RequestIdDisplay";

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

type EnterpriseChatWorkspaceProps = {
  chatbots: Chatbot[];
  organizationId: string;
  onUpgradeClick?: () => void;
};

export function EnterpriseChatWorkspace({
  chatbots,
  organizationId,
  onUpgradeClick,
}: EnterpriseChatWorkspaceProps) {
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

  const activeBot = chatbots.find((b) => b.id === selectedBotId) || chatbots[0];
  const activeBotId = activeBot?.id;
  const activeBotPublicId = activeBot?.public_id;
  const activeBotGreeting = activeBot?.greeting;

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // When selected bot changes, create or reset test session
  useEffect(() => {
    if (!activeBotPublicId) return;
    let active = true;
    setMessages([]);
    setChatError(null);
    setActiveSources([]);

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
      const response = await fetch(`/api/v1/public/chat/${activeBot.public_id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Token": session.visitor_token,
        },
        body: JSON.stringify({ message: text }),
      });

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
          errMessage = "Nội dung tin nhắn không hợp lệ (FastAPI 422 Validation).";
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
      const assistantMsg: WorkspaceMessage = {
        id: `msg-ai-${Date.now()}`,
        role: "ASSISTANT",
        content: data.reply,
        created_at: new Date().toISOString(),
        sources: data.sources || [],
        requestId: reqId,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (data.sources && data.sources.length > 0) {
        setActiveSources(data.sources);
      }

      // Refresh dashboard summary to sync quota counts
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

  return (
    <div className="card-swiss-strong grid grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_250px] min-h-[680px] bg-white">
      {/* LEFT COLUMN: CHATBOT SELECTOR & CONFIG INFO */}
      <div className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="font-semibold text-base text-slate-900">Chọn chatbot</h3>
          <p className="mt-1 text-xs text-slate-500">Bạn muốn thử trợ lý nào?</p>
        </div>

        <div className="p-2 space-y-1 overflow-y-auto flex-1 max-h-[300px] lg:max-h-none">
          {chatbots.length === 0 && (
            <p className="p-4 text-xs text-slate-500 text-center font-mono">Chưa có chatbot nào.</p>
          )}

          {chatbots.map((bot) => {
            const isSelected = bot.id === activeBot?.id;
            return (
              <button
                type="button"
                key={bot.id}
                onClick={() => setSelectedBotId(bot.id)}
                className={`w-full text-left p-3 transition-colors flex items-start gap-2.5 border ${
                  isSelected
                    ? "bg-[#edf3ff] border-[#c9dafb]"
                    : "bg-slate-50 border-transparent hover:border-slate-300 hover:bg-white"
                }`}
              >
                <span className="mt-1 h-3 w-3 shrink-0" style={{ backgroundColor: bot.primary_color || "#2455c7" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <b className="truncate text-sm text-slate-900">{bot.name}</b>
                    <span
                      className={`text-[9px] font-mono px-1 border ${
                        bot.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-slate-100 text-slate-600 border-slate-300"
                      }`}
                    >
                      {bot.is_active ? "Đang bật" : "Đã tắt"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    Còn <b>{bot.credit_balance.toLocaleString("vi-VN")}</b> lượt riêng
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ACTIVE BOT METADATA DRAWER */}
        {activeBot && (
          <div className="p-4 border-t border-slate-200 bg-white text-xs space-y-2">
            <span className="text-slate-600 block font-semibold">Thông tin chatbot</span>
            <div>
              <span className="text-slate-500">Giọng điệu:</span>{" "}
              <b className="text-slate-800">{activeBot.tone}</b>
            </div>
            <div>
              <span className="text-slate-500">Đã sử dụng:</span>{" "}
              <b className="text-slate-800">{activeBot.usage_count.toLocaleString("vi-VN")} tin nhắn</b>
            </div>
          </div>
        )}
      </div>

      {/* CENTER COLUMN: MAIN CHAT THREAD & COMPOSER */}
      <div className="flex flex-col min-w-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">
        {/* CHAT HEADER */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 border border-[#09090B]"
              style={{ backgroundColor: activeBot?.primary_color || "#0052FF" }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-base text-slate-950">
                  {activeBot?.name || "Trợ lý AI"}
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 font-sans truncate max-w-sm">
                Hãy thử đặt câu hỏi như một khách truy cập.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setChatError(null);
                if (session) {
                  setMessages([
                    {
                      id: `msg-reset-${Date.now()}`,
                      role: "ASSISTANT",
                      content: session.greeting || "Xin chào! Bạn cần tìm hiểu thông tin gì?",
                      created_at: new Date().toISOString(),
                    },
                  ]);
                }
              }}
              className="btn-swiss-secondary text-xs py-1 px-2.5 font-mono"
              title="Xóa ngữ cảnh hội thoại hiện tại"
            >
              <span>Bắt đầu lại</span>
            </button>
          </div>
        </div>

        {/* THREAD CONTAINER */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50 min-h-[420px]">
          {messages.map((msg) => {
            const isUser = msg.role === "USER";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-2xl ${
                  isUser ? "ml-auto" : "mr-auto"
                }`}
              >
                {/* ROLE HEADER */}
                <div className="flex items-center gap-2 mb-1 px-1 text-xs text-slate-500 font-semibold">
                  {isUser ? (
                    <span>Bạn</span>
                  ) : (
                    <>
                      <span>{activeBot?.name || "Trợ lý AI"}</span>
                      {msg.sources && msg.sources.length > 0 && (
                        <span className="bg-blue-50 text-blue-800 px-1.5 border border-blue-200">
                          {msg.sources.length} nguồn tài liệu
                        </span>
                      )}
                    </>
                  )}
                  <span className="text-[10px] text-slate-400 font-normal">
                    {new Date(msg.created_at).toLocaleTimeString("vi-VN", { hour12: false })}
                  </span>
                </div>

                {/* BUBBLE */}
                <div
                  className={`p-4 text-sm leading-7 whitespace-pre-wrap ${
                    isUser
                      ? "chat-user-message text-slate-950"
                      : "chat-ai-message text-slate-800"
                  }`}
                >
                  {msg.content}
                </div>

                {/* SOURCES FOOTER ON AI MESSAGE */}
                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 px-1 font-mono text-[10px]">
                    <span className="text-slate-500">Dựa trên:</span>
                    {msg.sources.map((src, i) => (
                      <span
                        key={i}
                        className="bg-white border border-slate-300 text-slate-700 px-1.5 py-0.5 inline-flex items-center gap-1"
                      >
                        <span className="truncate max-w-[150px]">{src.document_name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* LOADING STATE */}
          {isSending && (
            <div className="flex flex-col items-start max-w-md mr-auto">
              <div className="mb-1 px-1 text-xs text-slate-500 font-semibold">
                Trợ lý AI
              </div>
              <div className="chat-ai-message p-4 text-sm text-slate-600" role="status">
                Đang tìm thông tin để trả lời...
              </div>
            </div>
          )}

          {/* ERROR PRESENTATION */}
          {chatError && (
            <div className="border border-red-400 bg-red-50 p-4 text-red-900 text-sm" role="alert">
              <div className="flex items-start gap-2 font-bold font-mono">
                <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                <span>
                  Không gửi được tin nhắn {chatError.status ? `(HTTP ${chatError.status})` : ""}: {chatError.message}
                </span>
              </div>

              {chatError.retryAfter && (
                <p className="mt-2 text-xs font-mono text-red-800">
                  Bạn có thể thử lại sau {chatError.retryAfter} giây.
                </p>
              )}

              {chatError.requestId && (
                <div className="mt-2">
                  <RequestIdDisplay requestId={chatError.requestId} compact />
                </div>
              )}

              {chatError.status === 402 && onUpgradeClick && (
                <div className="mt-3">
                  <button type="button" onClick={onUpgradeClick} className="btn-swiss-primary text-xs py-1.5 px-3">
                    NÂNG CẤP GÓI NGAY
                  </button>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* COMPOSER */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={3}
              value={inputMessage}
              maxLength={2000}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending || !session}
              placeholder="Bạn muốn hỏi trợ lý điều gì?"
              className="input-swiss resize-none pr-24 text-sm"
            />

            <div className="absolute right-2.5 bottom-3 flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-400 select-none">
                {inputMessage.length}/2000
              </span>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isSending || !session}
                className="btn-swiss-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
              >
                <span>Gửi</span>
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Enter để gửi · Shift + Enter để xuống dòng
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: CONTEXT & SOURCE INSPECTOR */}
      <div className="hidden xl:flex flex-col border-slate-200 bg-slate-50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="font-semibold text-base text-slate-900">Tài liệu tham khảo</h3>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs">
          {activeSources.length === 0 ? (
            <div className="p-6 text-center text-slate-500 border border-dashed border-slate-300 bg-white">
              <FileText size={24} className="mx-auto mb-2 text-slate-400" />
              <p className="font-bold">Chưa có nguồn trích xuất</p>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">
                Khi AI trả lời dựa trên tài liệu đã upload, danh sách tệp và trích đoạn sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-slate-600 font-sans">
                Các tệp tài liệu được thuật toán vector/bm25 lọc và cung cấp vào prompt ngữ cảnh cho Gemini:
              </p>
              {activeSources.map((source, idx) => (
                <div key={idx} className="card-swiss p-3 bg-white border-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-700 font-bold">
                    <FileText size={14} />
                    <span className="truncate">{source.document_name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 break-all select-all">
                    DOC ID: {source.document_id}
                  </div>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-700">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Check size={11} /> MATCHED CONTEXT
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="p-3 border-t border-slate-200 bg-white text-[10px] font-mono text-slate-500">
          STATUS: VECTOR CONTEXT ONLINE
        </div>
      </div>
    </div>
  );
}
