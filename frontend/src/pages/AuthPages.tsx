import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth";
import { RequestIdDisplay } from "../components/RequestIdDisplay";
import { ApiError, api, getLastRequestId } from "../services/api";

const loginSchema = z.object({
  email: z.string().email("Định dạng email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

const registerSchema = z
  .object({
    full_name: z.string().min(2, "Họ tên phải từ 2 ký tự trở lên"),
    organization_name: z.string().min(2, "Tên doanh nghiệp phải từ 2 ký tự trở lên"),
    email: z.string().email("Định dạng email không hợp lệ"),
    password: z
      .string()
      .min(12, "Mật khẩu phải từ 12 ký tự trở lên")
      .regex(/[A-Z]/, "Cần ít nhất một chữ in hoa")
      .regex(/[a-z]/, "Cần ít nhất một chữ thường")
      .regex(/[0-9]/, "Cần ít nhất một chữ số"),
    password_confirmation: z.string().min(1, "Vui lòng xác nhận lại mật khẩu"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["password_confirmation"],
  });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
      <section className="auth-story hidden border-r p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
        <Link to="/" className="text-xl font-bold tracking-tight">Mạch <span className="text-[#2455c7]">AI</span></Link>
        <div className="max-w-lg">
          <p className="eyebrow">Không gian làm việc của bạn</p>
          <h2 className="mt-5 text-4xl font-bold leading-tight tracking-[-.05em] xl:text-5xl">Mỗi câu hỏi của khách đều là một cơ hội.</h2>
          <p className="mt-6 text-base leading-8 text-slate-600">Đưa kiến thức sản phẩm vào một nơi, để trợ lý bán hàng có thể giúp bạn trả lời nhanh và nhất quán.</p>
          <div className="mt-10 border-t border-[#ccd7e8] pt-6 text-sm leading-8 text-slate-700">
            <p>Tạo trợ lý theo thương hiệu của bạn</p>
            <p>Kiểm soát tài liệu trước khi sử dụng</p>
            <p>Theo dõi hội thoại và khách hàng tiềm năng</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">Mạch AI · Trợ lý bán hàng cho website</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-12">
        <div className="w-full max-w-lg">
          <Link to="/" className="mb-8 inline-block text-sm font-semibold text-slate-600 hover:text-[#2455c7]">← Về trang chủ</Link>
          <div className="auth-panel p-7 sm:p-10">
            <p className="eyebrow">Tài khoản Mạch AI</p>
            <h1 className="mt-3 text-3xl text-[#17233a] sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{subtitle}</p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [fieldErrors422, setFieldErrors422] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      setServerError(null);
      setFieldErrors422({});
      const current = await login(data.email, data.password);
      navigate(current.is_super_admin ? "/admin" : "/app", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.validationErrors && error.validationErrors.length > 0) {
          const map: Record<string, string> = {};
          error.validationErrors.forEach((err) => {
            const field = String(err.loc[err.loc.length - 1]);
            map[field] = err.msg;
          });
          setFieldErrors422(map);
        }
        setServerError({
          message: error.message,
          requestId: error.requestId || getLastRequestId(),
        });
      } else {
        setServerError({
          message: error instanceof Error ? error.message : "Đăng nhập không thành công",
          requestId: getLastRequestId(),
        });
      }
    }
  });

  if (user) {
    return <Navigate to={user.is_super_admin ? "/admin" : "/app"} replace />;
  }

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle="Tiếp tục quản lý trợ lý và các cuộc hội thoại của bạn."
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {/* EMAIL */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Email
          </label>
          <input
            {...register("email")}
            type="email"
            autoComplete="email"
            placeholder="doanhnghiep@domain.vn"
            className="input-swiss text-xs font-mono"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600 font-sans">{errors.email.message}</p>
          )}
          {fieldErrors422.email && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.email}</p>
          )}
        </div>

        {/* PASSWORD */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase">
              Mật khẩu
            </label>
            <Link
              to="/forgot-password"
              className="text-[11px] font-mono text-[#0052FF] hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="input-swiss text-xs font-mono"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600 font-sans">{errors.password.message}</p>
          )}
          {fieldErrors422.password && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.password}</p>
          )}
        </div>

        {/* SERVER ERROR & REQUEST ID TRACE */}
        {serverError && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-bold font-mono">ĐĂNG NHẬP THẤT BẠI: {serverError.message}</p>
            {serverError.requestId && (
              <div className="mt-2">
                <RequestIdDisplay requestId={serverError.requestId} compact />
              </div>
            )}
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-swiss-primary w-full text-xs py-3 font-mono"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600 font-sans">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-bold text-[#0052FF] hover:underline font-mono">
            Đăng ký miễn phí
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: createAccount, user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [fieldErrors422, setFieldErrors422] = useState<Record<string, string>>({});

  const form = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      setServerError(null);
      setFieldErrors422({});
      await createAccount(data);
      navigate("/app", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.validationErrors && error.validationErrors.length > 0) {
          const map: Record<string, string> = {};
          error.validationErrors.forEach((err) => {
            const field = String(err.loc[err.loc.length - 1]);
            map[field] = err.msg;
          });
          setFieldErrors422(map);
        }
        setServerError({
          message: error.message,
          requestId: error.requestId || getLastRequestId(),
        });
      } else {
        setServerError({
          message: error instanceof Error ? error.message : "Đăng ký không thành công",
          requestId: getLastRequestId(),
        });
      }
    }
  });

  if (user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Bắt đầu với 20 lượt chat miễn phí và 1 Chatbot độc lập."
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
        {/* FULL NAME */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Họ và tên
          </label>
          <input
            {...form.register("full_name")}
            placeholder="Nguyễn Văn A"
            className="input-swiss text-xs font-mono"
          />
          {form.formState.errors.full_name && (
            <p className="mt-1 text-xs text-red-600 font-sans">
              {form.formState.errors.full_name.message}
            </p>
          )}
          {fieldErrors422.full_name && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.full_name}</p>
          )}
        </div>

        {/* ORG NAME */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Tên công ty hoặc cửa hàng
          </label>
          <input
            {...form.register("organization_name")}
            placeholder="Công ty TNHH Giải Pháp Việt"
            className="input-swiss text-xs font-mono"
          />
          {form.formState.errors.organization_name && (
            <p className="mt-1 text-xs text-red-600 font-sans">
              {form.formState.errors.organization_name.message}
            </p>
          )}
          {fieldErrors422.organization_name && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.organization_name}</p>
          )}
        </div>

        {/* EMAIL */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Email
          </label>
          <input
            {...form.register("email")}
            type="email"
            placeholder="owner@company.vn"
            className="input-swiss text-xs font-mono"
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-red-600 font-sans">
              {form.formState.errors.email.message}
            </p>
          )}
          {fieldErrors422.email && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.email}</p>
          )}
        </div>

        {/* PASSWORD */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Mật khẩu (ít nhất 12 ký tự, có chữ hoa, chữ thường và số)
          </label>
          <input
            {...form.register("password")}
            type="password"
            placeholder="••••••••••••"
            className="input-swiss text-xs font-mono"
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-red-600 font-sans">
              {form.formState.errors.password.message}
            </p>
          )}
          {fieldErrors422.password && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.password}</p>
          )}
        </div>

        {/* PASSWORD CONFIRMATION */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Xác nhận mật khẩu
          </label>
          <input
            {...form.register("password_confirmation")}
            type="password"
            placeholder="••••••••••••"
            className="input-swiss text-xs font-mono"
          />
          {form.formState.errors.password_confirmation && (
            <p className="mt-1 text-xs text-red-600 font-sans">
              {form.formState.errors.password_confirmation.message}
            </p>
          )}
          {fieldErrors422.password_confirmation && (
            <p className="mt-1 text-xs text-red-600 font-mono">[HTTP 422] {fieldErrors422.password_confirmation}</p>
          )}
        </div>

        {/* ERROR SUMMARY */}
        {serverError && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-bold font-mono">ĐĂNG KÝ THẤT BẠI: {serverError.message}</p>
            {serverError.requestId && (
              <div className="mt-2">
                <RequestIdDisplay requestId={serverError.requestId} compact />
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="btn-swiss-primary w-full text-xs py-3 font-mono"
          >
            {form.formState.isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600 font-sans">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-bold text-[#0052FF] hover:underline font-mono">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const result = await api<{ detail: string }>("/auth/password-reset/request", {
        method: "POST",
        body: { email },
      });
      setMessage(result.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi yêu cầu đặt lại mật khẩu");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell
      title="Quên mật khẩu"
      subtitle="Nếu email tồn tại và dịch vụ email đã cấu hình, bạn sẽ nhận được hướng dẫn."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            Email đã đăng ký
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@company.vn"
            className="input-swiss text-xs font-mono"
          />
        </div>

        {message && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono">
            {message}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={sending}
            className="btn-swiss-primary w-full text-xs py-3 font-mono"
          >
            {sending ? "Đang gửi..." : "Gửi liên kết đặt lại"}
          </button>
        </div>

        <p className="text-center text-xs">
          <Link to="/login" className="font-bold text-[#0052FF] hover:underline font-mono">
            ← Quay lại đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("Mật khẩu xác nhận không khớp");
      return;
    }
    const token = params.get("token");
    if (!token) {
      setMessage("Liên kết đặt lại mật khẩu không hợp lệ");
      return;
    }
    setSending(true);
    try {
      await api<void>("/auth/password-reset/confirm", {
        method: "POST",
        body: { token, new_password: password },
      });
      navigate("/login");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không thể đặt lại mật khẩu");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell
      title="Đặt mật khẩu mới"
      subtitle="Liên kết chỉ có hiệu lực một lần và sẽ thu hồi mọi phiên đăng nhập cũ."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            MẬT KHẨU MỚI (TỐI THIỂU 12 KÝ TỰ)
          </label>
          <input
            type="password"
            minLength={12}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-swiss text-xs font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
            XÁC NHẬN MẬT KHẨU MỚI
          </label>
          <input
            type="password"
            minLength={12}
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="input-swiss text-xs font-mono"
          />
        </div>

        {message && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs font-mono">
            {message}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={sending}
            className="btn-swiss-primary w-full text-xs py-3 font-mono"
          >
            {sending ? "ĐANG CẬP NHẬT..." : "CẬP NHẬT MẬT KHẨU"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
