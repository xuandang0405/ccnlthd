export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

let accessToken: string | null = null;
let organizationId: string | null = null;
let latestRequestId: string | null = null;

export function configureApi(token: string | null, orgId: string | null) {
  accessToken = token;
  organizationId = orgId;
}

export function getLastRequestId(): string | null {
  return latestRequestId;
}

export type ValidationErrorDetail = {
  loc: (string | number)[];
  msg: string;
  type: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string | null,
    public readonly validationErrors?: ValidationErrorDetail[],
    public readonly retryAfter?: string | null,
    public readonly rateLimitRemaining?: string | null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function request(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error("Không thể kết nối máy chủ. Hãy mở run.bat và giữ cửa sổ đó hoạt động.");
  }
}

function parseErrorPayload(payload: unknown, response: Response, defaultMessage: string): ApiError {
  const headerReqId = response.headers.get("X-Request-ID");
  const retryAfter = response.headers.get("Retry-After");
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

  let detail = defaultMessage;
  let validationErrors: ValidationErrorDetail[] | undefined;

  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (body) {
    if (typeof body.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body.detail)) {
      validationErrors = body.detail.filter((err): err is ValidationErrorDetail =>
        err !== null && typeof err === "object" && Array.isArray(err.loc) && typeof err.msg === "string" && typeof err.type === "string"
      );
      detail = validationErrors.map((err) => err.msg || "Trường không hợp lệ").join(". ") || defaultMessage;
    }
  }

  const finalReqId = headerReqId || (body && typeof body.request_id === "string" ? body.request_id : null);
  if (finalReqId) {
    latestRequestId = finalReqId;
  }

  return new ApiError(detail, response.status, finalReqId, validationErrors, retryAfter, rateLimitRemaining);
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (organizationId) headers.set("X-Organization-ID", organizationId);

  const response = await request(`${API_BASE}/v1${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const headerReqId = response.headers.get("X-Request-ID");
  if (headerReqId) {
    latestRequestId = headerReqId;
  }

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => {
    if (response.ok) throw new Error("Máy chủ trả về nội dung không hợp lệ thay vì dữ liệu API. Hãy kiểm tra cấu hình máy chủ.");
    return {};
  });
  if (!response.ok) {
    throw parseErrorPayload(payload, response, "Yêu cầu không thành công");
  }
  return payload as T;
}

export async function uploadApi<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (organizationId) headers.set("X-Organization-ID", organizationId);
  const response = await request(`${API_BASE}/v1${path}`, { method: "POST", headers, body: form });

  const headerReqId = response.headers.get("X-Request-ID");
  if (headerReqId) {
    latestRequestId = headerReqId;
  }

  const payload = await response.json().catch(() => {
    if (response.ok) throw new Error("Máy chủ trả về nội dung không hợp lệ thay vì dữ liệu API. Hãy kiểm tra cấu hình máy chủ.");
    return {};
  });
  if (!response.ok) {
    throw parseErrorPayload(payload, response, "Tải tệp thất bại");
  }
  return payload as T;
}

export async function downloadApi(path: string): Promise<Blob> {
  const headers = new Headers({ Accept: "*/*" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (organizationId) headers.set("X-Organization-ID", organizationId);
  const response = await request(`${API_BASE}/v1${path}`, { headers });

  const headerReqId = response.headers.get("X-Request-ID");
  if (headerReqId) {
    latestRequestId = headerReqId;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw parseErrorPayload(payload, response, "Không tải được tệp");
  }
  return response.blob();
}
