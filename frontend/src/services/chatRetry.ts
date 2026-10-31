export type PendingChatMessage = {
  client_message_id: string;
  message: string;
  visitorToken: string;
};

function newMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // HTTP trong mạng nội bộ không có randomUUID; vẫn tạo UUID v4 bằng Web Crypto.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function pendingChatMessage(
  previous: PendingChatMessage | null,
  message: string,
  visitorToken: string
): PendingChatMessage {
  // Gửi lại nội dung đang lỗi dùng mã cũ; một câu hỏi mới phải có mã mới.
  if (previous?.message === message && previous.visitorToken === visitorToken) return previous;
  return { client_message_id: newMessageId(), message, visitorToken };
}

export async function postChatMessage(url: string, pending: PendingChatMessage): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let delay = 1000 * (attempt + 1);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Token": pending.visitorToken,
        },
        body: JSON.stringify({ message: pending.message, client_message_id: pending.client_message_id }),
        signal: controller.signal,
      });
      const processing = response.status === 409 && response.headers.has("Retry-After");
      const unavailable = [502, 503, 504].includes(response.status);
      if (attempt === 2 || (!processing && !unavailable)) return response;
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        // Không tự đợi vô hạn; người dùng vẫn có thể gửi lại thủ công với cùng mã.
        if (retryAfter > 5) return response;
        delay = Math.max(delay, retryAfter * 1000);
      }
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Máy chủ phản hồi quá lâu. Vui lòng gửi lại tin nhắn.");
        }
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");
}
