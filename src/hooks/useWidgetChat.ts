import { useEffect, useRef, useState } from "react";
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

export function useWidgetChat() {
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

  return {
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
  };
}
