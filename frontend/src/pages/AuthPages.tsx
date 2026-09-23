import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Bot } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth";
import { api } from "../services/api";

const loginSchema = z.object({ email: z.email("Email không hợp lệ"), password: z.string().min(1, "Nhập mật khẩu") });
const registerSchema = z.object({
  full_name: z.string().min(2, "Họ tên quá ngắn"),
  organization_name: z.string().min(2, "Tên doanh nghiệp quá ngắn"),
  email: z.email("Email không hợp lệ"),
  password: z.string().min(12, "Mật khẩu cần ít nhất 12 ký tự").regex(/[A-Z]/, "Cần chữ hoa").regex(/[a-z]/, "Cần chữ thường").regex(/[0-9]/, "Cần chữ số"),
  password_confirmation: z.string(),
}).refine((data) => data.password === data.password_confirmation, { message: "Mật khẩu xác nhận không khớp", path: ["password_confirmation"] });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="grid min-h-screen bg-white lg:grid-cols-2"><section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between"><Link to="/" className="flex items-center gap-2 font-bold"><span className="rounded-xl bg-blue-600 p-2"><Bot size={20}/></span>AI Sales Assistant</Link><div><p className="text-4xl font-black leading-tight">Trợ lý hiểu dữ liệu của doanh nghiệp bạn.</p><p className="mt-4 max-w-md leading-7 text-slate-300">Quản lý chatbot, tài liệu, hội thoại và khách hàng tiềm năng trong một không gian an toàn.</p></div><p className="text-sm text-slate-500">Dữ liệu giữa các doanh nghiệp được cách ly theo quyền truy cập.</p></section><section className="flex items-center justify-center p-6 sm:p-12"><div className="w-full max-w-md"><Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={16}/> Trang chủ</Link><h1 className="text-3xl font-black text-slate-950">{title}</h1><p className="mt-2 text-slate-600">{subtitle}</p>{children}</div></section></main>;
}

const inputClass = "mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export function LoginPage() {
  const { login, user } = useAuth(); const navigate = useNavigate(); const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async (data) => { try { setServerError(""); const current = await login(data.email, data.password); navigate(current.is_super_admin ? "/admin" : "/app", { replace: true }); } catch (error) { setServerError(error instanceof Error ? error.message : "Đăng nhập thất bại"); } });
  if (user) return <Navigate to={user.is_super_admin ? "/admin" : "/app"} replace/>;
  return <Shell title="Chào mừng trở lại" subtitle="Đăng nhập để quản lý trợ lý AI của doanh nghiệp."><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-semibold">Email<input {...register("email")} className={inputClass} autoComplete="email"/></label>{errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}<label className="block text-sm font-semibold">Mật khẩu<input type="password" {...register("password")} className={inputClass} autoComplete="current-password"/></label><div className="text-right"><Link to="/forgot-password" className="text-sm font-bold text-blue-700">Quên mật khẩu?</Link></div>{serverError && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{serverError}</div>}<button disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60">{isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}</button><p className="text-center text-sm text-slate-600">Chưa có tài khoản? <Link className="font-bold text-blue-700" to="/register">Đăng ký miễn phí</Link></p></form></Shell>;
}

export function RegisterPage() {
  const { register: createAccount } = useAuth(); const navigate = useNavigate(); const [serverError, setServerError] = useState("");
  const form = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const submit = form.handleSubmit(async (data) => { try { setServerError(""); await createAccount(data); navigate("/app"); } catch (error) { setServerError(error instanceof Error ? error.message : "Đăng ký thất bại"); } });
  return <Shell title="Tạo doanh nghiệp" subtitle="Bắt đầu với gói Free 20 lượt chat mỗi ngày."><form onSubmit={submit} className="mt-8 grid gap-4"><label className="text-sm font-semibold">Họ tên<input {...form.register("full_name")} className={inputClass}/><small className="text-red-600">{form.formState.errors.full_name?.message}</small></label><label className="text-sm font-semibold">Tên doanh nghiệp<input {...form.register("organization_name")} className={inputClass}/><small className="text-red-600">{form.formState.errors.organization_name?.message}</small></label><label className="text-sm font-semibold">Email<input {...form.register("email")} className={inputClass}/><small className="text-red-600">{form.formState.errors.email?.message}</small></label><label className="text-sm font-semibold">Mật khẩu<input type="password" {...form.register("password")} className={inputClass}/><small className="text-red-600">{form.formState.errors.password?.message}</small></label><label className="text-sm font-semibold">Xác nhận mật khẩu<input type="password" {...form.register("password_confirmation")} className={inputClass}/><small className="text-red-600">{form.formState.errors.password_confirmation?.message}</small></label>{serverError && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{serverError}</div>}<button disabled={form.formState.isSubmitting} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60">{form.formState.isSubmitting ? "Đang tạo..." : "Tạo tài khoản"}</button><p className="text-center text-sm text-slate-600">Đã có tài khoản? <Link className="font-bold text-blue-700" to="/login">Đăng nhập</Link></p></form></Shell>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSending(true); try { const result = await api<{ detail: string }>("/auth/password-reset/request", { method: "POST", body: { email } }); setMessage(result.detail); } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể gửi yêu cầu"); } finally { setSending(false); } }
  return <Shell title="Quên mật khẩu" subtitle="Nếu email tồn tại và dịch vụ email đã bật, bạn sẽ nhận liên kết một lần."><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-semibold">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} autoComplete="email"/></label>{message && <div role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}<button disabled={sending} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60">{sending ? "Đang gửi..." : "Gửi liên kết đặt lại"}</button><Link to="/login" className="block text-center text-sm font-bold text-blue-700">Quay lại đăng nhập</Link></form></Shell>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (password !== confirmation) { setMessage("Mật khẩu xác nhận không khớp"); return; } const token = params.get("token"); if (!token) { setMessage("Liên kết không hợp lệ"); return; } setSending(true); try { await api<void>("/auth/password-reset/confirm", { method: "POST", body: { token, new_password: password } }); navigate("/login"); } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể đặt lại mật khẩu"); } finally { setSending(false); } }
  return <Shell title="Đặt mật khẩu mới" subtitle="Liên kết chỉ dùng một lần và sẽ thu hồi các phiên đăng nhập cũ."><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-semibold">Mật khẩu mới<input type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} autoComplete="new-password"/></label><label className="block text-sm font-semibold">Xác nhận mật khẩu<input type="password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={inputClass} autoComplete="new-password"/></label>{message && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</div>}<button disabled={sending} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60">{sending ? "Đang cập nhật..." : "Đặt lại mật khẩu"}</button></form></Shell>;
}
