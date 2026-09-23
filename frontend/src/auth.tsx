import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, configureApi } from "./services/api";
import type { CurrentUser, Tokens } from "./types";

type AuthContextValue = {
  user: CurrentUser | null;
  organizationId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
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
  try { return JSON.parse(raw) as Tokens; } catch { return null; }
}

function saveSession(tokens: Tokens) {
  const raw = JSON.stringify(tokens);
  try { window.localStorage.setItem(SESSION_KEY, raw); } catch { /* Cookie remains available. */ }
  document.cookie = `${SESSION_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=604800; SameSite=Strict`;
}

function clearSession() {
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* Ignore unavailable storage. */ }
  document.cookie = `${SESSION_KEY}=; Path=/; Max-Age=0; SameSite=Strict`;
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
        configureApi(saved.access_token, null);
        const current = await api<CurrentUser>("/auth/me");
        if (!active) return;
        const org = current.organizations[0]?.id ?? null;
        configureApi(saved.access_token, org);
        setTokens(saved);
        setUser(current);
        setOrganizationId(org);
      } catch {
        clearSession();
        configureApi(null, null);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  async function acceptTokens(next: Tokens) {
    configureApi(next.access_token, null);
    const current = await api<CurrentUser>("/auth/me");
    const org = current.organizations[0]?.id ?? null;
    configureApi(next.access_token, org);
    saveSession(next);
    setTokens(next);
    setUser(current);
    setOrganizationId(org);
  }

  async function login(email: string, password: string) {
    const next = await api<Tokens>("/auth/login", { method: "POST", body: { email, password } });
    await acceptTokens(next);
  }

  async function register(payload: RegisterPayload) {
    const next = await api<Tokens>("/auth/register", { method: "POST", body: payload });
    await acceptTokens(next);
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

// Hook and provider intentionally share this module to keep session state private and in memory.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải được dùng bên trong AuthProvider");
  return value;
}
