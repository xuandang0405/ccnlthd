import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { api } from "./services/api";
import type { CurrentUser } from "./types";

const AdminPage = lazy(() => import("./pages/AdminPage").then((page) => ({ default: page.AdminPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((page) => ({ default: page.DashboardPage })));
const HomePage = lazy(() => import("./pages/HomePage").then((page) => ({ default: page.HomePage })));
const LegalPage = lazy(() => import("./pages/LegalPage").then((page) => ({ default: page.LegalPage })));
const WidgetPage = lazy(() => import("./pages/WidgetPage").then((page) => ({ default: page.WidgetPage })));
const LoginPage = lazy(() => import("./pages/AuthPages").then((page) => ({ default: page.LoginPage })));
const RegisterPage = lazy(() => import("./pages/AuthPages").then((page) => ({ default: page.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/AuthPages").then((page) => ({ default: page.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/AuthPages").then((page) => ({ default: page.ResetPasswordPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
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

  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_super_admin || verifiedUser.isError || (verifiedUser.data && !verifiedUser.data.is_super_admin)) {
    return <Navigate to="/app" replace />;
  }
  if (verifiedUser.isPending) return <p role="status">Đang xác minh quyền quản trị...</p>;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/app" element={<RequireUser><DashboardPage /></RequireUser>} />
      <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
      <Route path="/widget/:publicId" element={<WidgetPage />} />
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/data-policy" element={<LegalPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<p role="status">Đang tải trang...</p>}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
