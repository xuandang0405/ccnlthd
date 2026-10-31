import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { Plus } from "lucide-react";
import { useState } from "react";
import { EnterpriseChatWorkspace } from "../../components/EnterpriseChatWorkspace";
import { TechnicalCard } from "../../components/TechnicalCross";
import { ChatbotCreditControls } from "../../components/WorkspaceControls";

export function ChatbotViews({ workspace }: { workspace: CustomerWorkspace }) {
  const [clipboardError, setClipboardError] = useState("");
  const {
    organizationId,
    view,
    setView,
    name,
    setName,
    copiedBotId,
    setCopiedBotId,
    summary,
    chatbots,
    createChatbot,
    allocateCredits,
    deleteChatbot,
    availableSlots,
  } = workspace;
  if (!organizationId) return null;
  return (<>
    {view === "ai-workspace" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
            Xem trước câu trả lời
          </span>
          <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
            Thử trợ lý AI
          </h2>
          <p className="mt-1 text-sm text-slate-600 font-sans">
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
    {view === "chatbots" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
              Trợ lý của bạn
            </span>
            <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
              Chatbot của tôi
            </h2>
            <p className="mt-1 text-sm text-slate-600 font-sans">
              Đã tạo {summary.data?.chatbot_count ?? 0}/{summary.data?.chatbot_slots ?? 1} Chatbot. Còn lại {availableSlots} vị trí khả dụng.
            </p>
          </div>

          <div className="flex items-center gap-3 font-sans text-sm">
            <span className="card-swiss px-3 py-2 bg-white">
              Ví chung: <b>{(summary.data?.purchased_credits_remaining ?? 0).toLocaleString("vi-VN")}</b> Lượt
            </span>
          </div>
        </div>

        <div className="card-swiss p-5 border-slate-300 bg-white">
          <h3 className="font-sans text-sm font-semibold normal-case text-slate-900 mb-3">
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
              aria-label="Tên chatbot mới"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên trợ lý (VD: Trợ lý Bán hàng Thiết bị điện)..."
              className="input-swiss text-sm font-sans flex-1 min-w-[240px]"
            />
            <button
              type="submit"
              disabled={createChatbot.isPending || name.trim().length < 2 || availableSlots === 0}
              className="btn-swiss-primary text-sm py-2 px-5 font-sans inline-flex items-center gap-1.5"
            >
              <Plus size={15} />
              <span>{createChatbot.isPending ? "Đang tạo..." : "Tạo chatbot"}</span>
            </button>
          </form>

          {availableSlots === 0 && (
            <p className="mt-2.5 text-sm text-amber-800 font-sans">
              * Bạn đã sử dụng hết {summary.data?.chatbot_slots} vị trí chatbot được cấp. Bạn có thể xóa bot không dùng hoặc vào mục Gói & Thanh toán để mua thêm vị trí.
            </p>
          )}
          {createChatbot.isError && (
            <p className="mt-2 text-sm text-red-600 font-sans">
              Lỗi: {createChatbot.error.message}
            </p>
          )}
          {createChatbot.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Đã tạo chatbot. Bạn có thể cấu hình và lấy mã nhúng bên dưới.</p>}
        </div>

        {clipboardError && <p role="alert" className="feedback feedback-error">{clipboardError}</p>}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {!chatbots.isPending && !chatbots.isError && chatbots.data?.length === 0 && <div className="empty-state md:col-span-2 xl:col-span-3"><h3>Bạn chưa có chatbot</h3><p>Nhập tên ở form phía trên để tạo trợ lý đầu tiên.</p></div>}
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
                      className={`font-sans text-xs px-2 py-0.5 border font-bold ${bot.is_active
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-slate-100 text-slate-600 border-slate-300"
                        }`}
                    >
                      {bot.is_active ? "Đang hoạt động" : "Đã tắt"}
                    </span>
                  </div>

                  <h3 className="mt-3 font-semibold text-sm text-slate-900 font-sans">{bot.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 font-sans line-clamp-2">{bot.greeting}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 p-2.5 font-sans text-xs border border-slate-200">
                    <div>
                      <span className="text-slate-500 block text-xs">Lượt còn lại</span>
                      <b className="text-slate-900">{bot.credit_balance.toLocaleString("vi-VN")}</b>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs">Đã sử dụng</span>
                      <b className="text-slate-900">{bot.usage_count.toLocaleString("vi-VN")}</b>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="text-xs font-sans text-slate-500 normal-case block font-bold">
                      Chuyển lượt từ ví chung
                    </span>
                    <ChatbotCreditControls
                      balance={bot.credit_balance}
                      wallet={summary.data?.purchased_credits_remaining ?? 0}
                      pending={allocateCredits.isPending}
                      onAllocate={(amount) => allocateCredits.mutateAsync({ id: bot.id, amount })}
                    />
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="text-xs font-sans text-slate-500 normal-case block font-bold mb-1">
                      Mã nhúng vào website
                    </span>
                    <code className="block bg-slate-950 text-slate-200 p-2 font-sans text-xs break-all select-all">
                      {embedScript}
                    </code>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(embedScript);
                        setClipboardError("");
                        setCopiedBotId(bot.id);
                        window.setTimeout(() => setCopiedBotId(""), 2000);
                      } catch {
                        setClipboardError("Không thể sao chép tự động. Bạn có thể chọn và chép đoạn mã nhúng bằng tay.");
                      }
                    }}
                    className="btn-swiss-secondary text-sm py-1.5 px-3"
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
                    className="btn-swiss-danger text-sm py-1.5 px-2.5"
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
  </>);
}
