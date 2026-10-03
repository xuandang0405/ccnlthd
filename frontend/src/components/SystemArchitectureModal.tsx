import { useQuery } from "@tanstack/react-query";
import { Check, Cpu, X } from "lucide-react";
import { api } from "../services/api";

type HealthData = {
  status: string;
  components?: {
    database?: string;
    redis?: string;
  };
};

type SystemArchitectureModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SystemArchitectureModal({ isOpen, onClose }: SystemArchitectureModalProps) {
  const health = useQuery({
    queryKey: ["system-health-modal"],
    queryFn: () => api<HealthData>("/health"),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const dbLive = health.data?.components?.database === "up";
  const redisLive = health.data?.components?.redis && !health.data.components.redis.includes("down");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="card-swiss-strong w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#0F172A] px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-[#0052FF] text-white">
              <Cpu size={20} />
            </span>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider font-mono">
                SYSTEM ARCHITECTURE & TECHNICAL EVIDENCE // BẢO VỆ ĐỒ ÁN
              </h3>
              <p className="text-xs text-slate-400">
                Minh chứng kỹ thuật thực thi trên nền tảng Backend FastAPI & MongoDB / Redis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1.5 hover:bg-slate-800 transition-colors text-slate-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6 space-y-6">
          {/* SECTION 1: LIVE INFRASTRUCTURE STATE */}
          <div>
            <h4 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              1. TRẠNG THÁI HẠ TẦNG THỰC TẾ (REAL RUNTIME METRICS)
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-mono text-[11px] text-slate-500 uppercase block">CORE BACKEND</span>
                <b className="text-sm text-slate-950 font-mono mt-1 block">FASTAPI 0.115+</b>
                <span className="inline-block mt-2 font-mono text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                  HTTP REST // RUNNING
                </span>
              </div>

              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-mono text-[11px] text-slate-500 uppercase block">DATABASE</span>
                <b className="text-sm text-slate-950 font-mono mt-1 block">MONGODB MOTOR ASYNC</b>
                <span
                  className={`inline-block mt-2 font-mono text-[10px] px-2 py-0.5 border ${
                    dbLive
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-red-100 text-red-800 border-red-300"
                  }`}
                >
                  LIVE STATUS: {health.data?.components?.database?.toUpperCase() || "CHECKING"}
                </span>
              </div>

              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-mono text-[11px] text-slate-500 uppercase block">RATE LIMIT & QUOTA</span>
                <b className="text-sm text-slate-950 font-mono mt-1 block">REDIS STORE</b>
                <span
                  className={`inline-block mt-2 font-mono text-[10px] px-2 py-0.5 border ${
                    redisLive
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-amber-100 text-amber-800 border-amber-300"
                  }`}
                >
                  LIVE: {health.data?.components?.redis?.toUpperCase() || "CHECKING"}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: TECHNICAL EVIDENCE CHECKLIST */}
          <div>
            <h4 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              2. BẰNG CHỨNG THỰC THI KỸ THUẬT (TECHNICAL EVIDENCE)
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>JWT AUTHENTICATION & ROTATION</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Xác thực hai lớp (Access Token 15 phút + Refresh Token Session bảo mật, thu hồi phiên ngay lập tức).
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>PYDANTIC SCHEMAS & HTTP 422</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Kiểm soát dữ liệu đầu vào nghiêm ngặt bằng Pydantic model, phản hồi lỗi 422 định dạng chi tiết từng trường.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>QUẢN LÝ LƯỢT CHAT & GIỚI HẠN TẦN SUẤT</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Lượt chat được trừ từ ví của chatbot hoặc tài khoản. Giới hạn tần suất phiên khách truy cập giúp tránh gửi yêu cầu quá nhanh.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>HMAC-SHA256 WEBHOOK AUTHENTICATION</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Chữ ký bảo mật SePay Webhook chống giả mạo, kiểm tra timestamp ngăn chặn replay attacks.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>IDEMPOTENCY & TRANSACTION SAFETY</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Xử lý webhook thanh toán không ghi nhận trùng lặp đơn hàng nhờ ràng buộc duy nhất và transaction.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Check size={14} className="text-[#0052FF]" />
                  <span>OBSERVABILITY VỚI X-REQUEST-ID</span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans pl-5">
                  Tất cả request được HTTP middleware gắn X-Request-ID và log toàn bộ thời gian xử lý phục vụ kiểm toán.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: API CONTRACTS LIST */}
          <div>
            <h4 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              3. TÀI LIỆU API CHUẨN OPENAPI
            </h4>
            <div className="bg-slate-50 border border-slate-200 p-4 font-mono text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span>Tài liệu tương tác Swagger UI: </span>
                <code className="text-blue-700 font-bold">/docs</code>
                <span className="mx-2">|</span>
                <span>OpenAPI JSON Schema: </span>
                <code className="text-blue-700 font-bold">/openapi.json</code>
              </div>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="btn-swiss-secondary text-xs py-1 px-3 inline-flex items-center gap-1.5"
              >
                <span>MỞ SWAGGER /DOCS</span>
              </a>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>MẠCH AI · TỔNG QUAN KỸ THUẬT // FASTAPI + REACT 19</span>
          <button type="button" onClick={onClose} className="btn-swiss-primary text-xs py-1.5 px-4">
            ĐÃ HIỂU // ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
}
