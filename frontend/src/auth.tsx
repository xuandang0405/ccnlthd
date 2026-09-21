import { createContext, useContext, useState, type ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  async function acceptTokens(next: Tokens) {
    configureApi(next.access_token, null);
    const current = await api<CurrentUser>("/auth/me");
    const org = current.organizations[0]?.id ?? null;
    configureApi(next.access_token, org);
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
    setTokens(null);
    setUser(null);
    setOrganizationId(null);
  }

  const value = { user, organizationId, login, register, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook and provider intentionally share this module to keep session state private and in memory.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải được dùng bên trong AuthProvider");
  return value;
}
