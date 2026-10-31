import { AssistantContent } from "../components/AssistantContent";
import { useWidgetChat } from "../hooks/useWidgetChat";
import { siteConfig } from "../config/site";

export function WidgetPage() {
  const {
    session,
    messages,
    value,
    setValue,
    error,
    sending,
    endRef,
    showLead,
    setShowLead,
    customerName,
    setCustomerName,
    contact,
    setContact,
    leadStatus,
    send,
    submitLead,
    primaryColor,
  } = useWidgetChat();
  return (
    <main className="widget-shell flex h-[100dvh] flex-col text-slate-900">
      <header
        className="flex items-center gap-3 px-5 py-4 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <img className="widget-brand-icon" src={siteConfig.logoIcon} alt="" width={394} height={422} />
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-base font-semibold text-white">{siteConfig.name}</h1>
          <p className="mt-0.5 text-sm text-white/85">{session ? "Sẵn sàng hỗ trợ bạn" : error ? "Chưa kết nối được máy chủ" : "Đang kết nối..."}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowLead((old) => !old)}
          aria-label={showLead ? "Đóng biểu mẫu liên hệ" : "Để lại thông tin liên hệ"}
          className="border border-white/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
        >
          {showLead ? "Đóng" : "Để lại liên hệ"}
        </button>
      </header>

      {showLead && (
        <section className="border-b border-[#dce2e9] bg-[#eef3fb] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">
              Để lại thông tin để được tư vấn
            </p>
            <button
              type="button"
              onClick={() => setShowLead(false)}
              aria-label="Đóng biểu mẫu liên hệ"
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Đóng
            </button>
          </div>

          <div className="grid gap-2">
            <input
              aria-label="Tên của bạn (không bắt buộc)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
              placeholder="Tên của bạn (không bắt buộc)"
              className="input-swiss text-sm"
            />
            <input
              aria-label="Số điện thoại hoặc email liên hệ"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={320}
              placeholder="Số điện thoại hoặc Email liên hệ *"
              className="input-swiss text-sm"
            />
            <button
              type="button"
              onClick={submitLead}
              disabled={!session || !contact.trim()}
              className="btn-swiss-primary w-full"
            >
              Gửi thông tin
            </button>
            {leadStatus && (
              <p className="border border-slate-200 bg-white p-3 text-sm text-slate-700" role="status">
                {leadStatus}
              </p>
            )}
          </div>
        </section>
      )}

      <section aria-label="Nội dung cuộc trò chuyện" className="flex-1 space-y-5 overflow-y-auto bg-[#f8f9fb] p-5">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div
              key={index}
              className="ml-auto max-w-[88%] whitespace-pre-wrap border border-[#d5e1ff] bg-[#edf3ff] px-4 py-3 text-sm leading-6 text-[#17233a]"
            >
              {message.content}
            </div>
          ) : (
            <div key={index} className="max-w-[95%]">
              <div className="mb-2 text-sm font-semibold text-slate-500">
                Trợ lý bán hàng
              </div>
              <div className="chat-ai-message px-4 py-4 text-slate-900">
                <AssistantContent content={message.content} />
              </div>
            </div>
          )
        )}

        {sending && (
          <div className="chat-ai-message px-4 py-3 text-sm text-slate-600" role="status">
            Đang tìm thông tin để trả lời...
          </div>
        )}

        {error && (
          <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <div ref={endRef} />
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-[#dce2e9] bg-white p-3"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          disabled={!session || sending}
          aria-label="Tin nhắn"
          placeholder="Bạn muốn hỏi điều gì?"
          className="input-swiss flex-1 text-sm"
        />
        <button
          type="submit"
          aria-label="Gửi tin nhắn"
          disabled={!session || !value.trim() || sending}
          className="btn-swiss-primary px-4"
        >
          Gửi
        </button>
      </form>
    </main>
  );
}
