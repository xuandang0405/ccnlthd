import {
  Check,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { useChatbotPreview } from "../hooks/useChatbotPreview";
import type { Chatbot } from "../types";
import { RequestIdDisplay } from "./RequestIdDisplay";
import { AssistantContent } from "./AssistantContent";

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
  const {
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
  } = useChatbotPreview(chatbots, organizationId);
  return (
    <div className="card-swiss-strong grid grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_250px] min-h-[680px] bg-white">

      <div className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="font-semibold text-base text-slate-900">Chọn chatbot</h3>
          <p className="mt-1 text-sm text-slate-500">Bạn muốn thử trợ lý nào?</p>
        </div>

        <div className="p-2 space-y-1 overflow-y-auto flex-1 max-h-[300px] lg:max-h-none">
          {chatbots.length === 0 && (
            <p className="p-4 text-sm text-slate-500 text-center font-sans">Chưa có chatbot nào.</p>
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
                      className={`text-xs font-sans px-1 border ${
                        bot.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-slate-100 text-slate-600 border-slate-300"
                      }`}
                    >
                      {bot.is_active ? "Đang bật" : "Đã tắt"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-sans mt-1">
                    Còn <b>{bot.credit_balance.toLocaleString("vi-VN")}</b> lượt riêng
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {activeBot && (
          <div className="p-4 border-t border-slate-200 bg-white text-sm space-y-2">
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

      <div className="flex flex-col min-w-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">

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
              <p className="text-xs text-slate-500 font-sans truncate max-w-sm">
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
              className="btn-swiss-secondary text-sm py-1 px-2.5 font-sans"
              title="Xóa ngữ cảnh hội thoại hiện tại"
            >
              <span>Bắt đầu lại</span>
            </button>
          </div>
        </div>

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

                <div className="flex items-center gap-2 mb-1 px-1 text-sm text-slate-500 font-semibold">
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
                  <span className="text-xs text-slate-400 font-normal">
                    {new Date(msg.created_at).toLocaleTimeString("vi-VN", { hour12: false })}
                  </span>
                </div>

                <div
                  className={`p-4 text-sm leading-7 whitespace-pre-wrap ${
                    isUser
                      ? "chat-user-message text-slate-950"
                      : "chat-ai-message text-slate-800"
                  }`}
                >
                  {isUser ? msg.content : <AssistantContent content={msg.content} />}
                </div>

                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 px-1 font-sans text-xs">
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

          {isSending && (
            <div className="flex flex-col items-start max-w-md mr-auto">
              <div className="mb-1 px-1 text-sm text-slate-500 font-semibold">
                Trợ lý AI
              </div>
              <div className="chat-ai-message p-4 text-sm text-slate-600" role="status">
                Đang tìm thông tin để trả lời...
              </div>
            </div>
          )}

          {chatError && (
            <div className="border border-red-400 bg-red-50 p-4 text-red-900 text-sm" role="alert">
              <div className="flex items-start gap-2 font-bold font-sans">
                <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                <span>
                  Không gửi được tin nhắn {chatError.status ? `(HTTP ${chatError.status})` : ""}: {chatError.message}
                </span>
              </div>

              {chatError.retryAfter && (
                <p className="mt-2 text-sm font-sans text-red-800">
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
                  <button type="button" onClick={onUpgradeClick} className="btn-swiss-primary text-sm py-1.5 px-3">
                    Mua thêm lượt
                  </button>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="relative">
            <textarea
              aria-label="Câu hỏi thử trợ lý"
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
              <span className="font-sans text-xs text-slate-400 select-none">
                {inputMessage.length}/2000
              </span>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isSending || !session}
                className="btn-swiss-primary text-sm py-2 px-3.5 inline-flex items-center gap-1.5"
              >
                <span>Gửi</span>
              </button>
            </div>
          </div>

          <div className="mt-2 text-sm text-slate-500">
            Enter để gửi · Shift + Enter để xuống dòng
          </div>
        </div>
      </div>

      <div className="hidden xl:flex flex-col border-slate-200 bg-slate-50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="font-semibold text-base text-slate-900">Tài liệu tham khảo</h3>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-3 font-sans text-sm">
          {activeSources.length === 0 ? (
            <div className="p-6 text-center text-slate-500 border border-dashed border-slate-300 bg-white">
              <FileText size={24} className="mx-auto mb-2 text-slate-400" />
              <p className="font-bold">Chưa có nguồn trích xuất</p>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Tài liệu tham khảo sẽ xuất hiện sau khi trợ lý trả lời.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-600 font-sans">
                Các tài liệu đã được dùng làm nguồn tham khảo cho câu trả lời:
              </p>
              {activeSources.map((source, idx) => (
                <div key={idx} className="card-swiss p-3 bg-white border-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-700 font-bold">
                    <FileText size={14} />
                    <span className="truncate">{source.document_name}</span>
                  </div>
                  <div className="text-xs text-slate-500 break-all select-all">
                    Mã tài liệu: {source.document_id}
                  </div>
                  <div className="pt-1 flex items-center justify-between text-xs text-emerald-700">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Check size={11} /> Nguồn tham khảo
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="p-3 border-t border-slate-200 bg-white text-xs font-sans text-slate-500">
          Nguồn tài liệu của câu trả lời gần nhất
        </div>
      </div>
    </div>
  );
}
