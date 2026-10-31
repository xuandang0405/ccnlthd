import { useQuery } from "@tanstack/react-query";
import { File as FileIcon, Image, Paperclip } from "lucide-react";
import { downloadApi } from "../services/api";
import type { SupportTicket, TicketAttachment } from "../types";

type Props = {
  tickets?: SupportTicket[];
  selectedId: string | null;
  viewer: "ADMIN" | "CUSTOMER";
  reply: string;
  files: File[];
  sending: boolean;
  onSelect: (ticket: SupportTicket) => void;
  onReplyChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onSend: (ticket: SupportTicket) => void;
  onStatus?: (ticket: SupportTicket, status: SupportTicket["status"]) => void;
};

const statusLabel: Record<SupportTicket["status"], string> = {
  OPEN: "Mới · chờ xử lý",
  IN_PROGRESS: "Đang hỗ trợ",
  RESOLVED: "Đã giải quyết",
  CLOSED: "Đã đóng",
};

const statusColors: Record<SupportTicket["status"], string> = {
  OPEN: "bg-blue-50 text-blue-800 border-blue-300",
  IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-300",
  RESOLVED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-300",
};

function AttachmentView({
  ticketId,
  attachment,
  viewer,
}: {
  ticketId: string;
  attachment: TicketAttachment;
  viewer: Props["viewer"];
}) {
  const prefix = viewer === "ADMIN" ? "/admin/tickets" : "/tickets";
  const file = useQuery({
    queryKey: ["ticket-attachment", viewer, ticketId, attachment.id],
    queryFn: async () =>
      URL.createObjectURL(await downloadApi(`${prefix}/${ticketId}/attachments/${attachment.id}`)),
    staleTime: Infinity,
  });

  const size =
    attachment.size_bytes < 1024 * 1024
      ? `${(attachment.size_bytes / 1024).toFixed(1)} KB`
      : `${(attachment.size_bytes / 1024 / 1024).toFixed(1)} MB`;

  if (attachment.mime_type.startsWith("image/") && file.data) {
    return (
      <a
        href={file.data}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block border border-slate-300 bg-white"
      >
        <img
          src={file.data}
          alt={attachment.original_name}
          className="max-h-72 w-full object-contain bg-slate-50"
        />
        <span className="flex items-center gap-2 px-3 py-1.5 text-xs font-sans font-bold text-slate-700 border-t border-slate-200">
          <Image size={13} className="text-blue-600" />
          <span className="truncate">{attachment.original_name}</span>
          <span className="text-slate-400">({size})</span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={file.data}
      download={attachment.original_name}
      className={`mt-2 flex items-center gap-3 border border-slate-300 bg-white p-3 text-slate-800 hover:border-slate-900 transition-colors ${
        file.isLoading ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <span className="bg-slate-100 p-2 text-slate-700 border border-slate-200">
        <FileIcon size={16} />
      </span>
      <span className="min-w-0">
        <b className="block truncate text-sm font-sans">{attachment.original_name}</b>
        <small className="text-slate-500 font-sans text-xs">
          {file.isLoading ? "Đang tải dữ liệu..." : size}
        </small>
      </span>
    </a>
  );
}

export function TicketChat({
  tickets,
  selectedId,
  viewer,
  reply,
  files,
  sending,
  onSelect,
  onReplyChange,
  onFilesChange,
  onSend,
  onStatus,
}: Props) {
  const selected = tickets?.find((ticket) => ticket.id === selectedId) ?? tickets?.[0];
  const unread = (ticket: SupportTicket) =>
    viewer === "ADMIN" ? ticket.admin_unread_count : ticket.customer_unread_count;

  if (tickets?.length === 0) {
    return (
      <div className="card-swiss mt-6 p-12 text-center text-slate-500 font-sans text-sm">
        Chưa có cuộc trò chuyện hỗ trợ nào được tạo.
      </div>
    );
  }

  return (
    <div className="ticket-workspace card-swiss-strong mt-6 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] bg-white">

      <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="border-b border-slate-200 px-4 py-3 bg-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Hộp thư hỗ trợ
            </h3>
            <p className="text-sm text-slate-500">{tickets?.length ?? 0} cuộc trao đổi</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-none">
          {tickets?.map((ticket) => {
            const isSelected = selected?.id === ticket.id;
            const last = ticket.messages.at(-1);
            const unreadCount = unread(ticket);

            return (
              <button
                type="button"
                key={ticket.id}
                onClick={() => onSelect(ticket)}
                className={`w-full text-left p-3.5 border-b border-slate-200 transition-colors flex items-start gap-3 ${
                  isSelected
                    ? "bg-white border-l-4 border-l-[#0052FF]"
                    : "hover:bg-white bg-slate-50"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#e9eef8] text-sm font-bold text-brand">
                  {(ticket.created_by_name || ticket.created_by_email || "U").slice(0, 1).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <b className="truncate text-sm text-slate-900">
                      {ticket.created_by_name || ticket.created_by_email || "Khách hàng"}
                    </b>
                    {unreadCount > 0 && (
                      <span className="bg-red-600 text-white px-1.5 py-0.2 font-sans text-xs font-semibold">
                        {unreadCount}
                      </span>
                    )}
                  </div>

                  <span className="block truncate text-xs text-slate-500 font-sans">
                    {ticket.organization_name || ticket.created_by_email}
                  </span>

                  <span className="mt-1 block truncate text-sm font-bold text-slate-800">
                    {ticket.subject}
                  </span>

                  <div className="mt-1 flex items-center justify-between gap-1 text-xs font-sans text-slate-400">
                    <span className="truncate max-w-[150px]">
                      {last?.message || "Tệp đính kèm"}
                    </span>
                    <span>
                      {new Date(ticket.updated_at).toLocaleTimeString("vi-VN", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {selected ? (
        <section className="flex flex-col min-w-0 bg-white">

          <header className="border-b border-slate-200 p-4 bg-slate-50/70 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-sans text-xs font-semibold px-2 py-0.5 border ${
                    statusColors[selected.status]
                  }`}
                >
                  {statusLabel[selected.status]}
                </span>
              </div>

              <h3 className="font-semibold text-base text-slate-950 mt-1 font-sans">
                {selected.subject}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 text-sm text-slate-500">
                <span>{selected.created_by_email || "Chưa có email"}</span>
                <span>{selected.organization_name || "—"}</span>
              </div>
              <details className="mt-2 text-sm text-slate-500"><summary className="cursor-pointer">Mã yêu cầu</summary><code className="mt-1 block select-all break-all">{selected.id}</code></details>
            </div>

            {onStatus && viewer === "ADMIN" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Trạng thái:</span>
                <select
                  aria-label="Trạng thái yêu cầu hỗ trợ"
                  value={selected.status}
                  onChange={(e) => onStatus(selected, e.target.value as SupportTicket["status"])}
                  className="input-swiss text-sm font-sans py-1 px-2.5 bg-white font-bold"
                >
                  <option value="OPEN">Mới · chờ xử lý</option>
                  <option value="IN_PROGRESS">Đang hỗ trợ</option>
                  <option value="RESOLVED">Đã giải quyết</option>
                  <option value="CLOSED">Đã đóng</option>
                </select>
              </div>
            )}
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-5 bg-[#F8FAFC] max-h-[460px]">
            {selected.messages.map((message, idx) => {
              const isOwn = message.sender_type === viewer;
              return (
                <div
                  key={`${message.created_at}-${idx}`}
                  className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-2xl ${
                    isOwn ? "ml-auto" : "mr-auto"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1 text-sm text-slate-500 font-semibold">
                    <span>{message.sender_name}</span>
                    <span className="text-slate-400">
                      {new Date(message.created_at).toLocaleTimeString("vi-VN", { hour12: false })}{" "}
                      {new Date(message.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  <div
                    className={`p-4 text-sm leading-7 ${
                      isOwn
                        ? "bg-[#edf3ff] text-[#17233a] border border-[#d5e1ff]"
                        : "bg-white text-slate-900 border border-slate-300"
                    }`}
                  >
                    {message.message && <p className="whitespace-pre-wrap font-sans">{message.message}</p>}

                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {message.attachments.map((att) => (
                          <AttachmentView
                            key={att.id}
                            ticketId={selected.id}
                            attachment={att}
                            viewer={viewer}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selected.status !== "CLOSED" ? (
            <footer className="border-t border-slate-200 p-4 bg-white">
              <div className="flex items-end gap-2">
                <label
                  className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-3 text-slate-700 border border-slate-300 transition-colors"
                  title="Đính kèm ảnh hoặc tài liệu"
                >
                  <Paperclip size={18} />
                  <input
                    aria-label="Đính kèm ảnh hoặc tài liệu hỗ trợ"
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
                    className="sr-only"
                    onChange={(e) => {
                      onFilesChange(Array.from(e.target.files ?? []).slice(0, 5));
                      e.target.value = "";
                    }}
                  />
                </label>

                <textarea
                  aria-label="Tin nhắn hỗ trợ"
                  value={reply}
                  onChange={(e) => onReplyChange(e.target.value)}
                  rows={2}
                  maxLength={5000}
                  placeholder="Viết tin nhắn hỗ trợ..."
                  className="input-swiss resize-none flex-1 text-sm"
                />

                <button
                  type="button"
                  onClick={() => onSend(selected)}
                  disabled={sending || (!reply.trim() && files.length === 0)}
                  className="btn-swiss-primary px-4"
                >
                  {sending ? "Đang gửi..." : "Gửi"}
                </button>
              </div>

              {files.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm font-sans">
                  <span className="text-slate-500 normal-case">Tệp đính kèm:</span>
                  {files.map((item) => (
                    <span
                      key={`${item.name}-${item.size}`}
                      className="bg-blue-50 border border-blue-200 text-blue-900 px-2 py-0.5 text-xs inline-flex items-center gap-1"
                    >
                      <Paperclip size={10} />
                      <span className="truncate max-w-xs">{item.name}</span>
                      <button type="button" className="ml-1 underline" aria-label={`Bỏ tệp ${item.name}`} onClick={() => onFilesChange(files.filter((file) => file !== item))}>Bỏ</button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => onFilesChange([])}
                    className="text-red-600 hover:underline font-bold text-xs ml-1"
                  >
                    [bỏ tất cả]
                  </button>
                </div>
              )}
            </footer>
          ) : (
            <div className="border-t border-slate-200 p-4 bg-slate-100 text-center font-sans text-sm text-slate-500">
              Ticket đã đóng. liên hệ quản trị viên để mở lại nếu cần hỗ trợ thêm.
            </div>
          )}
        </section>
      ) : (
        <div className="p-12 text-center text-slate-400 font-sans text-sm">
          Chọn một ticket từ cột trái để xem nội dung.
        </div>
      )}
    </div>
  );
}
