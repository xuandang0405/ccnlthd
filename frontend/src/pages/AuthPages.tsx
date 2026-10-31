import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth";
import { RequestIdDisplay } from "../components/RequestIdDisplay";
import { ApiError, api, getLastRequestId } from "../services/api";
import { Brand } from "../components/Brand";
import { siteConfig } from "../config/site";

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
    <main className="auth-shell grid min-h-[100dvh] lg:grid-cols-[.9fr_1.1fr]">
      <section className="auth-story hidden border-r p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
        <Brand />
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
        <p className="text-sm leading-6 text-slate-600">{siteConfig.slogan}</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-12">
        <div className="w-full max-w-lg">
          <Link to="/" className="mb-8 inline-block text-sm font-semibold text-slate-600 hover:text-brand">← Về trang chủ</Link>
          <div className="auth-panel p-7 sm:p-10">
            <div className="mb-6 lg:hidden"><Brand /></div>
            <p className="eyebrow">Tài khoản</p>
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

        <div>
          <label htmlFor="login-email" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Email
          </label>
          <input
            id="login-email"
            {...register("email")}
            aria-invalid={!!(errors.email || fieldErrors422.email)}
            aria-describedby={(errors.email || fieldErrors422.email) ? "email-error" : undefined}
            type="email"
            autoComplete="email"
            placeholder="doanhnghiep@domain.vn"
            className="input-swiss text-sm font-sans"
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">{errors.email.message}</p>
          )}
          {fieldErrors422.email && (
            <p id={(errors.email) ? undefined : "email-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.email}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="login-password" className="block text-sm font-sans font-bold text-slate-700 normal-case">
              Mật khẩu
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-sans text-brand hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <input
            id="login-password"
            {...register("password")}
            aria-invalid={!!(errors.password || fieldErrors422.password)}
            aria-describedby={(errors.password || fieldErrors422.password) ? "password-error" : undefined}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="input-swiss text-sm font-sans"
          />
          {errors.password && (
            <p id="password-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">{errors.password.message}</p>
          )}
          {fieldErrors422.password && (
            <p id={(errors.password) ? undefined : "password-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.password}</p>
          )}
        </div>

        {serverError && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-bold font-sans">Đăng nhập thất bại: {serverError.message}</p>
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
            disabled={isSubmitting}
            className="btn-swiss-primary w-full text-sm py-3 font-sans"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-slate-600 font-sans">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-bold text-brand hover:underline font-sans">
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

        <div>
          <label htmlFor="register-full-name" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Họ và tên
          </label>
          <input
            id="register-full-name"
            {...form.register("full_name")}
            aria-invalid={!!(form.formState.errors.full_name || fieldErrors422.full_name)}
            aria-describedby={(form.formState.errors.full_name || fieldErrors422.full_name) ? "full_name-error" : undefined}
            placeholder="Nguyễn Văn A"
            className="input-swiss text-sm font-sans"
          />
          {form.formState.errors.full_name && (
            <p id="full_name-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">
              {form.formState.errors.full_name.message}
            </p>
          )}
          {fieldErrors422.full_name && (
            <p id={(form.formState.errors.full_name) ? undefined : "full_name-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.full_name}</p>
          )}
        </div>

        <div>
          <label htmlFor="register-organization" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Tên công ty hoặc cửa hàng
          </label>
          <input
            id="register-organization"
            {...form.register("organization_name")}
            aria-invalid={!!(form.formState.errors.organization_name || fieldErrors422.organization_name)}
            aria-describedby={(form.formState.errors.organization_name || fieldErrors422.organization_name) ? "organization_name-error" : undefined}
            placeholder="Công ty TNHH Giải Pháp Việt"
            className="input-swiss text-sm font-sans"
          />
          {form.formState.errors.organization_name && (
            <p id="organization_name-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">
              {form.formState.errors.organization_name.message}
            </p>
          )}
          {fieldErrors422.organization_name && (
            <p id={(form.formState.errors.organization_name) ? undefined : "organization_name-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.organization_name}</p>
          )}
        </div>

        <div>
          <label htmlFor="register-email" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Email
          </label>
          <input
            id="register-email"
            {...form.register("email")}
            aria-invalid={!!(form.formState.errors.email || fieldErrors422.email)}
            aria-describedby={(form.formState.errors.email || fieldErrors422.email) ? "email-error" : undefined}
            type="email"
            autoComplete="email"
            placeholder="owner@company.vn"
            className="input-swiss text-sm font-sans"
          />
          {form.formState.errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">
              {form.formState.errors.email.message}
            </p>
          )}
          {fieldErrors422.email && (
            <p id={(form.formState.errors.email) ? undefined : "email-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="register-password" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Mật khẩu (ít nhất 12 ký tự, có chữ hoa, chữ thường và số)
          </label>
          <input
            id="register-password"
            {...form.register("password")}
            aria-invalid={!!(form.formState.errors.password || fieldErrors422.password)}
            aria-describedby={(form.formState.errors.password || fieldErrors422.password) ? "password-error" : undefined}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            className="input-swiss text-sm font-sans"
          />
          {form.formState.errors.password && (
            <p id="password-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">
              {form.formState.errors.password.message}
            </p>
          )}
          {fieldErrors422.password && (
            <p id={(form.formState.errors.password) ? undefined : "password-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.password}</p>
          )}
        </div>

        <div>
          <label htmlFor="register-password-confirmation" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Xác nhận mật khẩu
          </label>
          <input
            id="register-password-confirmation"
            {...form.register("password_confirmation")}
            aria-invalid={!!(form.formState.errors.password_confirmation || fieldErrors422.password_confirmation)}
            aria-describedby={(form.formState.errors.password_confirmation || fieldErrors422.password_confirmation) ? "password_confirmation-error" : undefined}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            className="input-swiss text-sm font-sans"
          />
          {form.formState.errors.password_confirmation && (
            <p id="password_confirmation-error" role="alert" className="mt-1 text-sm text-red-600 font-sans">
              {form.formState.errors.password_confirmation.message}
            </p>
          )}
          {fieldErrors422.password_confirmation && (
            <p id={(form.formState.errors.password_confirmation) ? undefined : "password_confirmation-error"} role="alert" className="mt-1 text-sm text-red-600 font-sans">{fieldErrors422.password_confirmation}</p>
          )}
        </div>

        {serverError && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-bold font-sans">Đăng ký thất bại: {serverError.message}</p>
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
            className="btn-swiss-primary w-full text-sm py-3 font-sans"
          >
            {form.formState.isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-slate-600 font-sans">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-bold text-brand hover:underline font-sans">
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
          <label htmlFor="reset-request-email" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Email đã đăng ký
          </label>
          <input
            id="reset-request-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@company.vn"
            className="input-swiss text-sm font-sans"
          />
        </div>

        {message && (
          <div role="status" className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-sm font-sans">
            {message}
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm font-sans">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={sending}
            className="btn-swiss-primary w-full text-sm py-3 font-sans"
          >
            {sending ? "Đang gửi..." : "Gửi liên kết đặt lại"}
          </button>
        </div>

        <p className="text-center text-sm">
          <Link to="/login" className="font-bold text-brand hover:underline font-sans">
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
          <label htmlFor="reset-new-password" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Mật khẩu mới (tối thiểu 12 ký tự)
          </label>
          <input
            id="reset-new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-swiss text-sm font-sans"
          />
        </div>

        <div>
          <label htmlFor="reset-password-confirmation" className="block text-sm font-sans font-bold text-slate-700 normal-case mb-1">
            Xác nhận mật khẩu mới
          </label>
          <input
            id="reset-password-confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="input-swiss text-sm font-sans"
          />
        </div>

        {message && (
          <div role="alert" className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm font-sans">
            {message}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={sending}
            className="btn-swiss-primary w-full text-sm py-3 font-sans"
          >
            {sending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
