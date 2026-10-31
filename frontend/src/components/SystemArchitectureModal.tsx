import { Dialog } from "./Dialog";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
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
    <Dialog title="Thông tin kỹ thuật" description="Trạng thái kết nối và các thành phần của hệ thống." onClose={onClose} className="max-w-4xl">
        <div className="p-6 space-y-6">
          {health.isError && <p role="alert" className="feedback feedback-error">Không thể kiểm tra kết nối: {health.error.message}</p>}

          <div>
            <h4 className="font-sans text-sm font-bold text-slate-500 normal-case tracking-wider mb-3">
              1. trạng thái hạ tầng thực tế (real runtime metrics)
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-sans text-xs text-slate-500 normal-case block">Core backend</span>
                <b className="text-sm text-slate-950 font-sans mt-1 block">FastAPI</b>
                <span className="inline-block mt-2 font-sans text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {health.isError ? "Chưa kết nối" : health.data?.status || "Đang kiểm tra"}
                </span>
              </div>

              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-sans text-xs text-slate-500 normal-case block">DATABASE</span>
                <b className="text-sm text-slate-950 font-sans mt-1 block">MongoDB</b>
                <span
                  className={`inline-block mt-2 font-sans text-xs px-2 py-0.5 border ${
                    dbLive
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-red-100 text-red-800 border-red-300"
                  }`}
                >
                  Live status: {health.data?.components?.database?.toUpperCase() || "Chưa có dữ liệu"}
                </span>
              </div>

              <div className="card-swiss p-4 bg-slate-50 border-slate-300">
                <span className="font-sans text-xs text-slate-500 normal-case block">Rate limit & quota</span>
                <b className="text-sm text-slate-950 font-sans mt-1 block">Giới hạn tần suất</b>
                <span
                  className={`inline-block mt-2 font-sans text-xs px-2 py-0.5 border ${
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

          <div>
            <h4 className="font-sans text-sm font-bold text-slate-500 normal-case tracking-wider mb-3">
              2. bằng chứng thực thi kỹ thuật (technical evidence)
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Jwt authentication & rotation</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Đăng nhập bằng access token và refresh token; quyền truy cập được kiểm tra bởi máy chủ.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Pydantic schemas & http 422</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Kiểm soát dữ liệu đầu vào nghiêm ngặt bằng Pydantic model, phản hồi lỗi 422 định dạng chi tiết từng trường.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Quản lý lượt chat & giới hạn tần suất</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Lượt chat được trừ từ ví của chatbot hoặc tài khoản. Giới hạn tần suất phiên khách truy cập giúp tránh gửi yêu cầu quá nhanh.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Hmac-sha256 webhook authentication</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Máy chủ xác thực thông báo thanh toán từ SePay theo cấu hình triển khai.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Idempotency & transaction safety</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Máy chủ kiểm tra đơn hàng và giao dịch trước khi cập nhật quyền lợi.
                </p>
              </div>

              <div className="card-swiss p-3.5 border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Check size={14} className="text-brand" />
                  <span>Observability với x-request-id</span>
                </div>
                <p className="text-xs text-slate-600 font-sans pl-5">
                  Tất cả request được HTTP middleware gắn X-Request-ID và log toàn bộ thời gian xử lý phục vụ kiểm toán.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-sans text-sm font-bold text-slate-500 normal-case tracking-wider mb-2">
              3. tài liệu api chuẩn openapi
            </h4>
            <div className="bg-slate-50 border border-slate-200 p-4 font-sans text-sm text-slate-700 flex flex-wrap items-center justify-between gap-3">
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
                className="btn-swiss-secondary text-sm py-1 px-3 inline-flex items-center gap-1.5"
              >
                <span>Mở swagger /docs</span>
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between text-sm text-slate-500 font-sans">
          <span>Tổng quan kỹ thuật · FastAPI + React</span>
          <button type="button" onClick={onClose} className="btn-swiss-primary text-sm py-1.5 px-4">
            Đóng
          </button>
        </div>
    </Dialog>
  );
}
