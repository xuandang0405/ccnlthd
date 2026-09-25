import { useQuery } from "@tanstack/react-query";
import { File as FileIcon, Image, Mail, Paperclip, Send, UserRound } from "lucide-react";
import type { SupportTicket, TicketAttachment } from "../types";
import { downloadApi } from "../services/api";

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
  OPEN: "Mới",
  IN_PROGRESS: "Đang hỗ trợ",
  RESOLVED: "Đã giải quyết",
  CLOSED: "Đã đóng",
};

function AttachmentView({ ticketId, attachment, viewer }: { ticketId: string; attachment: TicketAttachment; viewer: Props["viewer"] }) {
  const prefix = viewer === "ADMIN" ? "/admin/tickets" : "/tickets";
  const file = useQuery({
    queryKey: ["ticket-attachment", viewer, ticketId, attachment.id],
    queryFn: async () => URL.createObjectURL(await downloadApi(`${prefix}/${ticketId}/attachments/${attachment.id}`)),
    staleTime: Infinity,
  });
  const size = attachment.size_bytes < 1024 * 1024
    ? `${(attachment.size_bytes / 1024).toFixed(1)} KB`
    : `${(attachment.size_bytes / 1024 / 1024).toFixed(1)} MB`;
  if (attachment.mime_type.startsWith("image/") && file.data) {
    return <a href={file.data} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-black/10 bg-white"><img src={file.data} alt={attachment.original_name} className="max-h-72 w-full object-contain"/><span className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600"><Image size={14}/>{attachment.original_name} · {size}</span></a>;
  }
  return <a href={file.data} download={attachment.original_name} className={`mt-2 flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3 text-slate-800 ${file.isLoading ? "pointer-events-none opacity-60" : ""}`}><span className="rounded-lg bg-slate-100 p-2"><FileIcon size={18}/></span><span className="min-w-0"><b className="block truncate text-sm">{attachment.original_name}</b><small className="text-slate-500">{file.isLoading ? "Đang tải..." : size}</small></span></a>;
}

export function TicketChat({ tickets, selectedId, viewer, reply, files, sending, onSelect, onReplyChange, onFilesChange, onSend, onStatus }: Props) {
  const selected = tickets?.find((ticket) => ticket.id === selectedId) ?? tickets?.[0];
  const unread = (ticket: SupportTicket) => viewer === "ADMIN" ? ticket.admin_unread_count : ticket.customer_unread_count;
  if (tickets?.length === 0) return <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Chưa có cuộc trò chuyện hỗ trợ.</div>;
  return <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid lg:min-h-[620px] lg:grid-cols-[330px_1fr]">
    <aside className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200 p-4"><h3 className="font-black">Hộp thư hỗ trợ</h3><p className="mt-1 text-xs text-slate-500">Mỗi email là một người gửi riêng.</p></div>
      <div className="max-h-72 overflow-y-auto lg:max-h-[560px]">{tickets?.map((ticket) => { const last = ticket.messages.at(-1); return <button type="button" key={ticket.id} onClick={() => onSelect(ticket)} className={`flex w-full gap-3 border-b border-slate-200 p-4 text-left transition ${selected?.id === ticket.id ? "bg-blue-50" : "hover:bg-white"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-black text-white">{(ticket.created_by_name || ticket.created_by_email || "U").slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{ticket.created_by_name || ticket.created_by_email || "Người dùng"}</b>{unread(ticket) > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white">{unread(ticket)}</span>}</span><span className="block truncate text-xs text-slate-500">{ticket.created_by_email || ticket.created_by_user_id}</span><span className="mt-1 block truncate text-sm font-semibold">{ticket.subject}</span><span className="mt-1 block truncate text-xs text-slate-500">{last?.message || last?.attachments?.[0]?.original_name}</span></span></button>; })}</div>
    </aside>
    {selected && <section className="flex min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div className="min-w-0"><h3 className="truncate font-black">{selected.subject}</h3><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Mail size={13}/>{selected.created_by_email || "Chưa có email"}</span><span className="inline-flex items-center gap-1 font-mono"><UserRound size={13}/>ID: {selected.created_by_user_id || "—"}</span><span>{selected.organization_name}</span></div></div>{onStatus ? <select value={selected.status} onChange={(event) => onStatus(selected, event.target.value as SupportTicket["status"])} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"><option value="OPEN">Mới</option><option value="IN_PROGRESS">Đang hỗ trợ</option><option value="RESOLVED">Đã giải quyết</option><option value="CLOSED">Đã đóng</option></select> : <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{statusLabel[selected.status]}</span>}</header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 lg:max-h-[440px]">{selected.messages.map((message, index) => { const own = message.sender_type === viewer; return <div key={`${message.created_at}-${index}`} className={`flex ${own ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${own ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-900"}`}><div className="flex items-center justify-between gap-4"><b>{message.sender_name}</b><span className={`text-[10px] ${own ? "text-blue-100" : "text-slate-400"}`}>{new Date(message.created_at).toLocaleString("vi-VN")}</span></div>{message.message && <p className="mt-1 whitespace-pre-wrap">{message.message}</p>}{message.attachments?.map((attachment) => <AttachmentView key={attachment.id} ticketId={selected.id} attachment={attachment} viewer={viewer}/>)}</div></div>; })}</div>
      {selected.status !== "CLOSED" && <footer className="border-t border-slate-200 p-4"><div className="flex items-end gap-2"><label className="cursor-pointer rounded-xl bg-slate-100 p-3 text-slate-700 hover:bg-slate-200" title="Đính kèm ảnh hoặc tệp"><Paperclip size={20}/><input type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip" className="hidden" onChange={(event) => { onFilesChange(Array.from(event.target.files ?? []).slice(0, 5)); event.target.value = ""; }}/></label><textarea value={reply} onChange={(event) => onReplyChange(event.target.value)} rows={2} maxLength={5000} placeholder="Nhập tin nhắn..." className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3"/><button type="button" onClick={() => onSend(selected)} disabled={sending || (!reply.trim() && files.length === 0)} className="rounded-xl bg-blue-600 p-3 text-white disabled:opacity-40" title="Gửi"><Send size={20}/></button></div>{files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((item) => <span key={`${item.name}-${item.size}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{item.name}</span>)}<button type="button" onClick={() => onFilesChange([])} className="text-xs font-bold text-red-600">Bỏ tệp</button></div>}</footer>}
    </section>}
  </div>;
}
