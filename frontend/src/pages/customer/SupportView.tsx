import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { Paperclip } from "lucide-react";
import { TicketChat } from "../../components/TicketChat";

export function SupportView({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
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
    tickets,
    createTicket,
    replyTicket,
    markTicketRead,
  } = workspace;
  return (<>
    {view === "support" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
              Chúng tôi ở đây để hỗ trợ
            </span>
            <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
              Hỗ trợ
            </h2>
            <p className="mt-1 text-sm text-slate-600 font-sans">
              Gửi yêu cầu hỗ trợ trực tiếp đến ban quản trị hệ thống, kèm ảnh và tệp đính kèm.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateTicket(!showCreateTicket)}
            className="btn-swiss-primary text-sm py-2 px-4 font-sans"
          >
            {showCreateTicket ? "Đóng biểu mẫu" : "Tạo yêu cầu hỗ trợ"}
          </button>
        </div>

        {showCreateTicket && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ticketSubject.trim() && ticketMessage.trim()) createTicket.mutate();
            }}
            className="card-swiss-strong p-6 border-slate-900 bg-white space-y-4 max-w-2xl"
          >
            <h3 className="font-sans text-sm font-semibold normal-case text-slate-900">
              Yêu cầu hỗ trợ mới
            </h3>
            <div>
              <label htmlFor="ticket-subject" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
                Tiêu đề yêu cầu
              </label>
              <input
                id="ticket-subject"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="VD: Cần hỗ trợ nạp thêm tài liệu bảng giá..."
                maxLength={200}
                className="input-swiss text-sm font-sans"
              />
            </div>

            <div>
              <label htmlFor="ticket-detail" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
                Chi tiết vấn đề cần hỗ trợ
              </label>
              <textarea
                id="ticket-detail"
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Mô tả cụ thể vấn đề hoặc kèm mã Request ID..."
                className="input-swiss text-sm font-sans resize-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <label className="btn-swiss-secondary cursor-pointer text-sm py-2 px-3 font-sans inline-flex items-center gap-1.5">
                <Paperclip size={13} />
                <span>Đính kèm tệp</span>
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
                  className="sr-only"
                  onChange={(e) => {
                    setTicketCreateFiles(Array.from(e.target.files ?? []).slice(0, 5));
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={createTicket.isPending || ticketSubject.trim().length < 3 || ticketMessage.trim().length < 5}
                className="btn-swiss-primary text-sm py-2 px-5 font-sans"
              >
                {createTicket.isPending ? "Đang gửi..." : "Gửi yêu cầu"}
              </button>

              {ticketCreateFiles.map((f) => (
                <span key={f.name} className="text-xs font-sans bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 break-all">
                  {f.name}
                  <button type="button" className="ml-2 underline" aria-label={`Bỏ tệp ${f.name}`} onClick={() => setTicketCreateFiles(ticketCreateFiles.filter((file) => file !== f))}>Bỏ</button>
                </span>
              ))}
            </div>

            {createTicket.isError && (
              <p className="text-sm text-red-600 font-sans">
                Lỗi gửi ticket: {createTicket.error.message}
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
  </>);
}
