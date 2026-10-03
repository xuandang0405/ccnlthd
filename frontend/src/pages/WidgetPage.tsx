import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { API_BASE } from "../services/api";

type WidgetSession = {
  visitor_token: string;
  conversation_id: string;
  greeting: string;
  primary_color: string;
  expires_at: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

async function readApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    await response.text().catch(() => "");
    if (response.status >= 500) {
      throw new Error("Máy chủ chatbot đang tạm ngưng. Vui lòng thử lại sau.");
    }
    throw new Error("Không nhận được phản hồi hợp lệ từ máy chủ chatbot.");
  }
  const data = (await response.json().catch(() => null)) as T | ApiErrorPayload | null;
  if (!response.ok) {
    let detail: string | null = null;
    if (data && typeof data === "object" && "detail" in data) {
      if (typeof data.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data.detail)) {
        detail = data.detail.map((err) => err.msg).join(". ");
      }
    }
    throw new Error(detail || fallbackMessage);
  }
  if (!data) throw new Error(fallbackMessage);
  return data as T;
}

const pricePattern = /((?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND))/giu;
const exactPricePattern = /^(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND)$/iu;

function PriceText({ children }: { children: string }) {
  return children.split(pricePattern).map((part, index) =>
    exactPricePattern.test(part) ? (
      <strong
        key={index}
        className="price-highlight inline-block border px-1.5 py-0.5 font-bold"
      >
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function InlineContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-extrabold text-slate-950">
        <PriceText>{part.slice(2, -2)}</PriceText>
      </strong>
    ) : (
      <PriceText key={index}>{part}</PriceText>
    )
  );
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
      blocks.push(
        <h4
          key={index}
          className="mt-3 text-sm font-semibold text-slate-950 first:mt-0"
        >
          <InlineContent text={heading[1]} />
        </h4>
      );
    } else if (bullet) {
      blocks.push(
        <div key={index} className="flex gap-2 border-l-2 border-[#2455c7] pl-3 text-sm">
          <span className="font-bold text-blue-700">·</span>
          <p className="min-w-0 font-sans">
            <InlineContent text={bullet[1]} />
          </p>
        </div>
      );
    } else if (numbered) {
      blocks.push(
        <div key={index} className="flex gap-2 border-l-2 border-[#2455c7] pl-3 text-sm">
          <span className="font-bold text-blue-700">
            {numbered[1]}
          </span>
          <p className="min-w-0 font-sans">
            <InlineContent text={numbered[2]} />
          </p>
        </div>
      );
    } else if (note) {
      blocks.push(
        <aside
          key={index}
          className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <span className="font-mono font-bold text-amber-700">!</span>
          <p className="min-w-0">
            <InlineContent text={note[1]} />
          </p>
        </aside>
      );
    } else {
      blocks.push(
        <p key={index} className="font-sans">
          <InlineContent text={line} />
        </p>
      );
    }
  });

  return <div className="assistant-copy space-y-2 break-words">{blocks}</div>;
}

export function WidgetPage() {
  const { publicId = "" } = useParams();
  const [params] = useSearchParams();
  const [session, setSession] = useState<WidgetSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionRequest = useRef<Promise<WidgetSession> | null>(null);
  const sessionKey = useRef("");
  const [showLead, setShowLead] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [leadStatus, setLeadStatus] = useState("");

  useEffect(() => {
    let active = true;
    const origin = params.get("parentOrigin") || location.origin;
    const key = `${publicId}|${origin}`;

    if (sessionKey.current !== key) {
      sessionKey.current = key;
      sessionRequest.current = null;
    }

    if (!sessionRequest.current) {
      sessionRequest.current = fetch(`${API_BASE}/v1/public/chat/${publicId}/sessions`, {
        method: "POST",
        headers: { "X-Widget-Origin": origin },
      }).then((response) => readApiResponse<WidgetSession>(response, "Không thể mở phiên chat"));
    }

    sessionRequest.current
      .then((data) => {
        if (active) {
          setSession(data);
          setMessages([{ role: "assistant", content: data.greeting }]);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Không thể kết nối máy chủ chatbot");
        }
      });

    return () => {
      active = false;
    };
  }, [publicId, params]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const message = value.trim();
    if (!message || !session || sending) return;
    setValue("");
    setError("");
    setMessages((old) => [...old, { role: "user", content: message }]);
    setSending(true);

    try {
      const response = await fetch(`${API_BASE}/v1/public/chat/${publicId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Token": session.visitor_token,
        },
        body: JSON.stringify({ message }),
      });
      const data = await readApiResponse<{ reply: string }>(response, "Không thể gửi tin nhắn");
      setMessages((old) => [...old, { role: "assistant", content: data.reply }]);
    } catch (reason) {
      setMessages((old) => old.slice(0, -1));
      setError(reason instanceof Error ? reason.message : "Lỗi kết nối");
      setValue(message);
    } finally {
      setSending(false);
    }
  }

  async function submitLead() {
    if (!session || !contact.trim()) return;
    setLeadStatus("Đang gửi...");
    const isEmail = contact.includes("@");

    try {
      const response = await fetch(`${API_BASE}/v1/public/chat/${publicId}/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Token": session.visitor_token,
        },
        body: JSON.stringify({
          customer_name: customerName || null,
          email: isEmail ? contact : null,
          phone: isEmail ? null : contact,
          intent_summary: messages.filter((item) => item.role === "user").slice(-1)[0]?.content || null,
        }),
      });
      await readApiResponse<unknown>(response, "Không thể gửi thông tin");
      setLeadStatus("Đã gửi thông tin thành công. Cảm ơn bạn!");
      setCustomerName("");
      setContact("");
      window.setTimeout(() => setShowLead(false), 2500);
    } catch (reason) {
      setLeadStatus(reason instanceof Error ? reason.message : "Lỗi kết nối");
    }
  }

  const primaryColor = session?.primary_color || "#0052FF";

  return (
    <main className="widget-shell flex h-screen flex-col text-slate-900">
      <header
        className="flex items-center gap-3 px-5 py-4 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-base font-semibold">Trợ lý bán hàng</h1>
          <p className="mt-0.5 text-xs text-white/85">{session ? "Sẵn sàng hỗ trợ bạn" : "Đang kết nối..."}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowLead((old) => !old)}
          aria-label={showLead ? "Đóng biểu mẫu liên hệ" : "Để lại thông tin liên hệ"}
          className="border border-white/50 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
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
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
              placeholder="Tên của bạn (không bắt buộc)"
              className="input-swiss text-sm"
            />
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={320}
              placeholder="Số điện thoại hoặc Email liên hệ *"
              className="input-swiss text-sm"
            />
            <button
              type="button"
              onClick={submitLead}
              disabled={!contact.trim()}
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
              <div className="mb-2 text-xs font-semibold text-slate-500">
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
