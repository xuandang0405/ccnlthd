import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api, configureApi } from "./services/api";
import type { CurrentUser, Tokens } from "./types";

type AuthContextValue = {
  user: CurrentUser | null;
  organizationId: string | null;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (payload: RegisterPayload) => Promise<CurrentUser>;
  logout: () => Promise<void>;
};

type RegisterPayload = {
  full_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  organization_name: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_KEY = "ai-sales-session";

function readSavedSession(): Tokens | null {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(SESSION_KEY); } catch { /* Cookie fallback below. */ }
  if (!raw) {
    const prefix = `${SESSION_KEY}=`;
    const item = document.cookie.split("; ").find((value) => value.startsWith(prefix));
    if (item) raw = decodeURIComponent(item.slice(prefix.length));
  }
  if (!raw) return null;
  try {
    const tokens = JSON.parse(raw) as Tokens;
    if (!tokens.session_expires_at || new Date(tokens.session_expires_at).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return tokens;
  } catch { return null; }
}

function saveSession(tokens: Tokens) {
  const raw = JSON.stringify(tokens);
  try { window.localStorage.setItem(SESSION_KEY, raw); } catch { /* Cookie remains available. */ }
  const maxAge = Math.max(0, Math.floor((new Date(tokens.session_expires_at).getTime() - Date.now()) / 1000));
  document.cookie = `${SESSION_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
}

function clearSession() {
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* Ignore unavailable storage. */ }
  document.cookie = `${SESSION_KEY}=; Path=/; Max-Age=0; SameSite=Strict`;
}

async function resolveSession(next: Tokens) {
  configureApi(next.access_token, null);
  const current = await api<CurrentUser>("/auth/me");
  return { current, organizationId: current.organizations[0]?.id ?? null };
}

async function recoverSession(fallback: Tokens, forceRefresh = false) {
  const run = async () => {
    const latest = readSavedSession() ?? fallback;
    const anotherTabAlreadyRefreshed = latest.refresh_token !== fallback.refresh_token;
    if (!forceRefresh || anotherTabAlreadyRefreshed) {
      try {
        const resolved = await resolveSession(latest);
        return { tokens: latest, ...resolved };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
    }
    configureApi(null, null);
    const next = await api<Tokens>("/auth/refresh", { method: "POST", body: { refresh_token: latest.refresh_token } });
    const resolved = await resolveSession(next);
    // Lưu token mới trước khi nhả khóa để tab khác không dùng lại token cũ.
    saveSession(next);
    return { tokens: next, ...resolved };
  };
  if (navigator.locks) return navigator.locks.request(`${SESSION_KEY}-refresh`, run);
  return run();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      const saved = readSavedSession();
      if (!saved) { if (active) setIsLoading(false); return; }
      try {
        let next = saved;
        let resolved;
        try {
          resolved = await resolveSession(next);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          const recovered = await recoverSession(saved);
          next = recovered.tokens;
          resolved = recovered;
        }
        if (!active) return;
        configureApi(next.access_token, resolved.organizationId);
        saveSession(next);
        setTokens(next);
        setUser(resolved.current);
        setOrganizationId(resolved.organizationId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          configureApi(null, null);
        } else {
          // Giữ refresh token khi server tạm lỗi để có thể khôi phục phiên sau khi tải lại.
          configureApi(saved.access_token, null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!tokens) return;
    const refreshIn = Math.max(0, new Date(tokens.expires_at).getTime() - Date.now() - 60_000);
    const timer = window.setTimeout(async () => {
      try {
        const recovered = await recoverSession(tokens, true);
        const next = recovered.tokens;
        const resolved = recovered;
        configureApi(next.access_token, resolved.organizationId);
        saveSession(next);
        setTokens(next);
        setUser(resolved.current);
        setOrganizationId(resolved.organizationId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          configureApi(null, null);
          clearSession();
          setTokens(null);
          setUser(null);
          setOrganizationId(null);
        } else {
          // Lỗi mạng tạm thời chưa đủ căn cứ để xóa phiên đang còn hạn.
          configureApi(tokens.access_token, organizationId);
        }
      }
    }, refreshIn);
    return () => window.clearTimeout(timer);
  }, [tokens, organizationId]);

  useEffect(() => {
    if (!tokens) return;
    const remaining = new Date(tokens.session_expires_at).getTime() - Date.now();
    const expire = () => {
      configureApi(null, null);
      clearSession();
      setTokens(null);
      setUser(null);
      setOrganizationId(null);
    };
    if (remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [tokens]);

  async function acceptTokens(next: Tokens) {
    const { current, organizationId: org } = await resolveSession(next);
    configureApi(next.access_token, org);
    saveSession(next);
    setTokens(next);
    setUser(current);
    setOrganizationId(org);
    return current;
  }

  async function login(email: string, password: string) {
    const next = await api<Tokens>("/auth/login", { method: "POST", body: { email, password } });
    return acceptTokens(next);
  }

  async function register(payload: RegisterPayload) {
    const next = await api<Tokens>("/auth/register", { method: "POST", body: payload });
    return acceptTokens(next);
  }

  async function logout() {
    if (tokens) {
      try { await api<void>("/auth/logout", { method: "POST", body: { refresh_token: tokens.refresh_token } }); }
      catch { /* Local logout still completes when the network is unavailable. */ }
    }
    configureApi(null, null);
    clearSession();
    setTokens(null);
    setUser(null);
    setOrganizationId(null);
  }

  const value = { user, organizationId, login, register, logout };
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 font-semibold text-slate-600">Đang khôi phục phiên đăng nhập...</div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Đặt hook cùng provider để trạng thái phiên chỉ được quản lý trong module này.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải được dùng bên trong AuthProvider");
  return value;
}
