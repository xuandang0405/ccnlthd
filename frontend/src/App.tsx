import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/AuthPages";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { WidgetPage } from "./pages/WidgetPage";
import { api } from "./services/api";
import type { CurrentUser } from "./types";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace/>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const verifiedUser = useQuery({
    queryKey: ["admin-access", user?.id],
    queryFn: () => api<CurrentUser>("/auth/me"),
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (!user) return <Navigate to="/login" replace/>;
  if (!user.is_super_admin || verifiedUser.isError || (verifiedUser.data && !verifiedUser.data.is_super_admin)) {
    return <Navigate to="/app" replace/>;
  }
  if (verifiedUser.isPending) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 font-semibold text-slate-600">Đang xác minh quyền quản trị...</div>;
  }
  return children;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/register" element={<RegisterPage/>}/>
    <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
    <Route path="/reset-password" element={<ResetPasswordPage/>}/>
    <Route path="/app" element={<RequireUser><DashboardPage/></RequireUser>}/>
    <Route path="/admin" element={<RequireAdmin><AdminPage/></RequireAdmin>}/>
    <Route path="/widget/:publicId" element={<WidgetPage/>}/>
    <Route path="/:slug" element={<LegalPage/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter></AuthProvider></QueryClientProvider>;
}
