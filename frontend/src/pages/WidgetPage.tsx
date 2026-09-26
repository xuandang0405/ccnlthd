import { Bot, Send, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
type WidgetSession = { visitor_token: string; conversation_id: string; greeting: string; primary_color: string; expires_at: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

const pricePattern = /((?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND))/giu;
const exactPricePattern = /^(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND)$/iu;

function PriceText({ children }: { children: string }) {
  return children.split(pricePattern).map((part, index) => exactPricePattern.test(part)
    ? <strong key={index} className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 font-black text-amber-900">{part}</strong>
    : part);
}

function InlineContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index} className="font-extrabold text-slate-950"><PriceText>{part.slice(2, -2)}</PriceText></strong>
    : <PriceText key={index}>{part}</PriceText>);
}

function AssistantContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const heading = line.match(/^#{1,3}\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    const note = line.match(/^\*([^*].*)\*$/);
    if (heading) {
      blocks.push(<h3 key={index} className="mt-3 text-[15px] font-black leading-5 text-slate-950 first:mt-0"><InlineContent text={heading[1]}/></h3>);
    } else if (bullet) {
      blocks.push(<div key={index} className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"/><p className="min-w-0"><InlineContent text={bullet[1]}/></p></div>);
    } else if (numbered) {
      blocks.push(<div key={index} className="flex gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-black text-blue-700">{numbered[1]}</span><p className="min-w-0"><InlineContent text={numbered[2]}/></p></div>);
    } else if (note) {
      blocks.push(<aside key={index} className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-black">!</span><p className="min-w-0"><InlineContent text={note[1]}/></p></aside>);
    } else {
      blocks.push(<p key={index}><InlineContent text={line}/></p>);
    }
  });
  return <div className="space-y-2.5 break-words text-[13.5px] leading-6 text-slate-700">{blocks}</div>;
}

export function WidgetPage() {
  const { publicId = "" } = useParams(); const [params] = useSearchParams();
  const [session, setSession] = useState<WidgetSession | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([]); const [value, setValue] = useState(""); const [error, setError] = useState(""); const [sending, setSending] = useState(false); const endRef = useRef<HTMLDivElement>(null);
  const sessionRequest = useRef<Promise<WidgetSession> | null>(null);
  const sessionKey = useRef("");
  const [showLead, setShowLead] = useState(false); const [customerName, setCustomerName] = useState(""); const [contact, setContact] = useState(""); const [leadStatus, setLeadStatus] = useState("");
  useEffect(() => { let active = true; const origin = params.get("parentOrigin") || location.origin; const key = `${publicId}|${origin}`; if (sessionKey.current !== key) { sessionKey.current = key; sessionRequest.current = null; } if (!sessionRequest.current) { sessionRequest.current = fetch(`${API_BASE}/v1/public/chat/${publicId}/sessions`, { method: "POST", headers: { "X-Widget-Origin": origin } }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Không thể mở phiên chat"); return data as WidgetSession; }); } sessionRequest.current.then((data) => { if (active) { setSession(data); setMessages([{ role: "assistant", content: data.greeting }]); } }).catch((reason) => active && setError(reason.message)); return () => { active = false; }; }, [publicId, params]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  async function send() { const message = value.trim(); if (!message || !session || sending) return; setValue(""); setError(""); setMessages((old) => [...old, { role: "user", content: message }]); setSending(true); try { const response = await fetch(`${API_BASE}/v1/public/chat/${publicId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", "X-Visitor-Token": session.visitor_token }, body: JSON.stringify({ message }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Không thể gửi tin nhắn"); setMessages((old) => [...old, { role: "assistant", content: data.reply }]); } catch (reason) { setError(reason instanceof Error ? reason.message : "Lỗi kết nối"); } finally { setSending(false); } }
  async function submitLead() { if (!session || !contact.trim()) return; setLeadStatus("Đang gửi..."); const isEmail = contact.includes("@"); try { const response = await fetch(`${API_BASE}/v1/public/chat/${publicId}/leads`, { method: "POST", headers: { "Content-Type": "application/json", "X-Visitor-Token": session.visitor_token }, body: JSON.stringify({ customer_name: customerName || null, email: isEmail ? contact : null, phone: isEmail ? null : contact, intent_summary: messages.filter((item) => item.role === "user").slice(-1)[0]?.content || null }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Không thể gửi thông tin"); setLeadStatus("Đã gửi. Cảm ơn bạn!"); } catch (reason) { setLeadStatus(reason instanceof Error ? reason.message : "Lỗi kết nối"); } }
  const color = session?.primary_color || "#2563eb";
  return <main className="flex h-screen flex-col bg-white text-slate-900"><header className="flex items-center gap-3 px-4 py-4 text-white" style={{ backgroundColor: color }}><span className="rounded-full bg-white/20 p-2"><Bot size={20}/></span><div className="flex-1"><h1 className="font-bold">Trợ lý AI</h1><p className="text-xs text-white/80">{session ? "Sẵn sàng hỗ trợ" : "Đang kết nối..."}</p></div><button onClick={() => setShowLead((old) => !old)} aria-label="Để lại thông tin" className="rounded-full bg-white/20 p-2">{showLead ? <X size={18}/> : <UserPlus size={18}/>}</button></header>{showLead && <section className="border-b border-slate-200 bg-white p-4"><p className="text-sm font-bold">Để lại thông tin để được tư vấn</p><div className="mt-2 grid gap-2"><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={200} placeholder="Tên của bạn (không bắt buộc)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/><input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={320} placeholder="Email hoặc số điện thoại" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/><button onClick={submitLead} disabled={!contact.trim()} className="rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: color }}>Gửi thông tin</button>{leadStatus && <p className="text-xs text-slate-600">{leadStatus}</p>}</div></section>}<section className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">{messages.map((message, index) => message.role === "user" ? <div key={index} className="ml-auto max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-6 text-white shadow-sm" style={{ backgroundColor: color }}>{message.content}</div> : <div key={index} className="max-w-[94%]"><div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold text-slate-500"><span className="rounded-full bg-blue-100 p-1 text-blue-700"><Bot size={12}/></span>Trợ lý AI</div><div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3.5 shadow-sm"><AssistantContent content={message.content}/></div></div>)}{sending && <div className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><span className="flex gap-1" aria-label="Đang trả lời"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]"/></span></div>}{error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div ref={endRef}/></section><form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex gap-2 border-t border-slate-200 bg-white p-3"><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={2000} disabled={!session || sending} aria-label="Tin nhắn" placeholder="Nhập câu hỏi..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"/><button type="submit" aria-label="Gửi" disabled={!session || !value.trim() || sending} className="rounded-xl p-3 text-white disabled:opacity-40" style={{ backgroundColor: color }}><Send size={18}/></button></form></main>;
}
