import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, QrCode, RefreshCw, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { PaymentOrder, PaymentOrderStatus, PaymentProduct } from "../types";

type PaymentModalProps = {
  product: PaymentProduct | null;
  onClose: () => void;
};

type PaymentMachineState = "IDLE" | "CREATING" | "WAITING" | "CHECKING" | "PAID" | "FAILED" | "EXPIRED";

export function PaymentModal({ product, onClose }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Mutation to create payment order
  const createOrder = useMutation({
    mutationFn: (productCode: string) =>
      api<PaymentOrder>(`/payments/orders/product/${productCode}`, { method: "POST" }),
  });

  // Automatically start order creation when modal opens with product
  const createOrderMutate = createOrder.mutate;
  useEffect(() => {
    if (product?.code && !createOrder.data && !createOrder.isPending && !createOrder.isError) {
      createOrderMutate(product.code);
    }
  }, [product?.code, createOrder.data, createOrder.isPending, createOrder.isError, createOrderMutate]);

  const orderId = createOrder.data?.id;

  // Poll order status every 5 seconds until settled
  const orderStatusQuery = useQuery({
    queryKey: ["payment-order-status", orderId],
    queryFn: () => api<PaymentOrderStatus>(`/payments/orders/${orderId}`),
    enabled: !!orderId,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      if (currentStatus === "SUCCESS" || currentStatus === "EXPIRED" || currentStatus === "FAILED") {
        return false;
      }
      return 5000;
    },
  });

  const backendStatus = orderStatusQuery.data?.status ?? createOrder.data?.status;

  // Derive explicit State Machine
  let machineState: PaymentMachineState = "IDLE";
  if (createOrder.isPending) {
    machineState = "CREATING";
  } else if (createOrder.isError) {
    machineState = "FAILED";
  } else if (backendStatus === "SUCCESS") {
    machineState = "PAID";
  } else if (backendStatus === "EXPIRED") {
    machineState = "EXPIRED";
  } else if (backendStatus === "FAILED") {
    machineState = "FAILED";
  } else if (orderStatusQuery.isFetching) {
    machineState = "CHECKING";
  } else if (createOrder.data) {
    machineState = "WAITING";
  }

  // When confirmed paid, invalidate credit balance and dashboard
  useEffect(() => {
    if (machineState === "PAID") {
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
    }
  }, [machineState, queryClient]);

  if (!product) return null;

  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="card-swiss-strong w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#0F172A] px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-[#0052FF] text-white">
              <QrCode size={18} />
            </span>
            <div>
              <h3 className="font-black text-sm text-slate-950 uppercase tracking-wider font-mono">
                PAYMENT // VIETQR GATEWAY
              </h3>
              <p className="text-xs text-slate-600">
                Thanh toán qua quét mã VietQR tự động xác nhận qua webhook
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1.5 hover:bg-slate-200 transition-colors text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* STATE BANNER */}
        <div className="px-6 pt-4">
          {machineState === "CREATING" && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-blue-600" />
              <span>TRẠNG THÁI: ĐANG TẠO ĐƠN THANH TOÁN MỚI TỪ MÁY CHỦ...</span>
            </div>
          )}

          {machineState === "WAITING" && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 animate-ping inline-block" />
                TRẠNG THÁI: CHỜ THANH TOÁN (TỰ ĐỘNG KIỂM TRA MỖI 5 GIÂY)
              </span>
              <button
                type="button"
                onClick={() => orderStatusQuery.refetch()}
                className="text-[11px] underline font-bold"
              >
                KIỂM TRA NGAY
              </button>
            </div>
          )}

          {machineState === "CHECKING" && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-blue-600" />
              <span>TRẠNG THÁI: ĐANG ĐỐI SOÁT VỚI HỆ THỐNG SEPAY...</span>
            </div>
          )}

          {machineState === "PAID" && (
            <div className="p-4 bg-emerald-50 border border-emerald-400 text-emerald-900 text-xs font-mono flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <b className="text-sm font-sans block mb-1">THANH TOÁN THÀNH CÔNG!</b>
                <span>
                  Đơn hàng đã được xác nhận thanh toán hợp lệ. Quyền lợi đã được cộng vào tài khoản của bạn.
                </span>
              </div>
            </div>
          )}

          {machineState === "EXPIRED" && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-900 text-xs font-mono flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <span>TRẠNG THÁI: ĐƠN HÀNG ĐÃ HẾT HẠN. HÃY TẠO ĐƠN MỚI.</span>
            </div>
          )}

          {machineState === "FAILED" && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-900 text-xs font-mono flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <span>LỖI: {createOrder.error?.message || "Không thể khởi tạo giao dịch"}</span>
            </div>
          )}
        </div>

        {/* ORDER DETAILS & QR */}
        {createOrder.data && machineState !== "PAID" && (
          <div className="p-6 grid gap-6 md:grid-cols-[260px_1fr]">
            {/* QR CODE CONTAINER - ZERO ROUNDING */}
            <div className="border border-slate-300 p-3 bg-white flex flex-col items-center">
              <img
                src={createOrder.data.qr_code_url}
                alt={`VietQR đơn ${createOrder.data.order_code}`}
                className="w-full aspect-square object-contain"
              />
              <a
                href={createOrder.data.qr_code_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-xs font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                <span>MỞ QR KÍCH THƯỚC LỚN</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* DETAILS TABLE */}
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 uppercase block">Gói đăng ký</span>
                <b className="text-sm font-sans text-slate-900">{createOrder.data.product_name}</b>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Ngân hàng</span>
                  <b className="text-slate-900">{createOrder.data.bank_code}</b>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Chủ tài khoản</span>
                  <b className="text-slate-900 truncate block">{createOrder.data.account_name}</b>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Số tài khoản</span>
                  <b className="text-sm text-slate-900">{createOrder.data.account_number}</b>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createOrder.data!.account_number, setCopiedAccount)}
                  className="btn-swiss-secondary text-[11px] py-1 px-2.5"
                >
                  {copiedAccount ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedAccount ? "ĐÃ CHÉP" : "CHÉP"}</span>
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Số tiền cần chuyển</span>
                  <b className="text-base text-blue-700 font-black">
                    {createOrder.data.amount.toLocaleString("vi-VN")} ₫
                  </b>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(String(createOrder.data!.amount), setCopiedAmount)}
                  className="btn-swiss-secondary text-[11px] py-1 px-2.5"
                >
                  {copiedAmount ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedAmount ? "ĐÃ CHÉP" : "CHÉP"}</span>
                </button>
              </div>

              {/* MANDATORY TRANSFER CONTENT */}
              <div className="p-3 bg-blue-50 border-2 border-blue-600">
                <span className="text-[11px] font-bold text-blue-800 uppercase block">
                  NỘI DUNG CHUYỂN KHOẢN (BẮT BUỘC CHÍNH XÁC)
                </span>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <b className="text-sm font-black text-blue-950 select-all break-all">
                    {createOrder.data.transfer_content}
                  </b>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createOrder.data!.transfer_content, setCopiedCode)}
                    className="btn-swiss-primary text-xs py-1.5 px-3 shrink-0"
                  >
                    {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedCode ? "ĐÃ CHÉP" : "CHÉP MÃ"}</span>
                  </button>
                </div>
              </div>

              {createOrder.data.expires_at && (
                <p className="text-[11px] text-slate-500 font-sans">
                  * Đơn thanh toán có hiệu lực đến {new Date(createOrder.data.expires_at).toLocaleTimeString("vi-VN")} ngày {new Date(createOrder.data.expires_at).toLocaleDateString("vi-VN")}.
                </p>
              )}
            </div>
          </div>
        )}

        {/* PAID SUCCESS VIEW */}
        {machineState === "PAID" && (
          <div className="p-8 text-center space-y-4">
            <div className="inline-flex p-4 bg-emerald-100 text-emerald-700">
              <Check size={40} />
            </div>
            <h4 className="text-xl font-black text-slate-950">GIAO DỊCH ĐÃ HOÀN TẤT</h4>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Gói dịch vụ <b>{product.name}</b> đã được kích hoạt thành công. Bạn có thể sử dụng ngay trong các chatbot của mình.
            </p>
            <div className="pt-4">
              <button type="button" onClick={onClose} className="btn-swiss-primary px-6 py-2.5">
                QUAY LẠI WORKSPACE
              </button>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono">GATEWAY: SEPAY VIETQR // REAL-TIME WEBHOOK</span>
          <button type="button" onClick={onClose} className="btn-swiss-secondary text-xs py-1.5 px-4">
            ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
}
