const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

let accessToken: string | null = null;
let organizationId: string | null = null;

export function configureApi(token: string | null, orgId: string | null) {
  accessToken = token;
  organizationId = orgId;
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (organizationId) headers.set("X-Organization-ID", organizationId);

  const response = await fetch(`${API_BASE}/v1${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : "Yêu cầu không thành công";
    throw new Error(detail);
  }
  return payload as T;
}

export async function uploadApi<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (organizationId) headers.set("X-Organization-ID", organizationId);
  const response = await fetch(`${API_BASE}/v1${path}`, { method: "POST", headers, body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Tải tệp thất bại");
  }
  return payload as T;
}
