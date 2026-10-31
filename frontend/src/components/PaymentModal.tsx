import { Dialog } from "./Dialog";
import { Check, Copy, ExternalLink, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { usePaymentCheckout } from "../hooks/usePaymentCheckout";
import type { PaymentProduct } from "../types";

type PaymentModalProps = {
  product: PaymentProduct | null;
  onClose: () => void;
};

export function PaymentModal({ product, onClose }: PaymentModalProps) {
  const { createOrder, orderStatusQuery, machineState } = usePaymentCheckout(product);
  const [clipboardError, setClipboardError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  if (!product) return null;

  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setClipboardError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setClipboardError("Không thể sao chép. Bạn có thể chọn và chép nội dung bằng tay.");
    }
  }

  return (
    <Dialog title="Thanh toán bằng VietQR" description="Quét mã bằng ứng dụng ngân hàng. Trạng thái được cập nhật từ máy chủ." onClose={onClose} className="max-w-3xl">
        <div className="px-6 pt-4" aria-live="polite">
          {clipboardError && <p role="alert" className="feedback feedback-error">{clipboardError}</p>}
          {orderStatusQuery.isError && <div role="alert" className="feedback feedback-error"><span>Chưa kiểm tra được thanh toán: {orderStatusQuery.error.message}. Không chuyển tiền lại khi chưa xác minh.</span><button type="button" className="btn-swiss-secondary" disabled={orderStatusQuery.isFetching} onClick={() => orderStatusQuery.refetch()}>Kiểm tra lại</button></div>}
          {machineState === "CREATING" && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-sm font-sans flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-blue-600" />
              <span>Trạng thái: đang tạo đơn thanh toán mới từ máy chủ...</span>
            </div>
          )}

          {machineState === "WAITING" && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-sm font-sans flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 animate-ping inline-block" />
                Trạng thái: chờ thanh toán (tự động kiểm tra mỗi 5 giây)
              </span>
              <button
                type="button"
                onClick={() => orderStatusQuery.refetch()}
                className="text-xs underline font-bold"
              >
                Kiểm tra ngay
              </button>
            </div>
          )}

          {machineState === "CHECKING" && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-sm font-sans flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-blue-600" />
              <span>Trạng thái: đang đối soát với hệ thống sepay...</span>
            </div>
          )}

          {machineState === "PAID" && (
            <div className="p-4 bg-emerald-50 border border-emerald-400 text-emerald-900 text-sm font-sans flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <b className="text-sm font-sans block mb-1">Thanh toán thành công!</b>
                <span>
                  Đơn hàng đã được xác nhận thanh toán hợp lệ. Quyền lợi đã được cộng vào tài khoản của bạn.
                </span>
              </div>
            </div>
          )}

          {machineState === "EXPIRED" && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-900 text-sm font-sans flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <span>Trạng thái: đơn hàng đã hết hạn. hãy tạo đơn mới.</span>
            </div>
          )}

          {machineState === "FAILED" && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-900 text-sm font-sans flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <span>Lỗi: {createOrder.error?.message || "Không thể khởi tạo giao dịch"}</span>
            </div>
          )}
        </div>

        {createOrder.data && machineState !== "PAID" && (
          <div className="p-6 grid gap-6 md:grid-cols-[260px_1fr]">

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
                className="mt-3 text-sm font-sans text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                <span>Mở mã QR kích thước lớn</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <div className="space-y-3 font-sans text-sm">
              <div className="p-3 bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 normal-case block">Gói đăng ký</span>
                <b className="text-sm font-sans text-slate-900">{createOrder.data.product_name}</b>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 normal-case block">Ngân hàng</span>
                  <b className="text-slate-900">{createOrder.data.bank_code}</b>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 normal-case block">Chủ tài khoản</span>
                  <b className="text-slate-900 break-words block">{createOrder.data.account_name}</b>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 normal-case block">Số tài khoản</span>
                  <b className="text-sm text-slate-900">{createOrder.data.account_number}</b>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createOrder.data!.account_number, setCopiedAccount)}
                  className="btn-swiss-secondary text-xs py-1 px-2.5"
                >
                  {copiedAccount ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedAccount ? "Đã chép" : "Chép"}</span>
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 normal-case block">Số tiền cần chuyển</span>
                  <b className="text-base text-blue-700 font-semibold">
                    {createOrder.data.amount.toLocaleString("vi-VN")} ₫
                  </b>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(String(createOrder.data!.amount), setCopiedAmount)}
                  className="btn-swiss-secondary text-xs py-1 px-2.5"
                >
                  {copiedAmount ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedAmount ? "Đã chép" : "Chép"}</span>
                </button>
              </div>

              <div className="p-3 bg-blue-50 border-2 border-blue-600">
                <span className="text-xs font-bold text-blue-800 normal-case block">
                  Nội dung chuyển khoản (bắt buộc chính xác)
                </span>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <b className="text-sm font-semibold text-blue-950 select-all break-all">
                    {createOrder.data.transfer_content}
                  </b>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createOrder.data!.transfer_content, setCopiedCode)}
                    className="btn-swiss-primary text-sm py-1.5 px-3 shrink-0"
                  >
                    {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedCode ? "Đã chép" : "Chép mã"}</span>
                  </button>
                </div>
              </div>

              {createOrder.data.expires_at && (
                <p className="text-xs text-slate-500 font-sans">
                  * Đơn thanh toán có hiệu lực đến {new Date(createOrder.data.expires_at).toLocaleTimeString("vi-VN")} ngày {new Date(createOrder.data.expires_at).toLocaleDateString("vi-VN")}.
                </p>
              )}
            </div>
          </div>
        )}

        {machineState === "PAID" && (
          <div className="p-8 text-center space-y-4">
            <div className="inline-flex p-4 bg-emerald-100 text-emerald-700">
              <Check size={40} />
            </div>
            <h4 className="text-xl font-semibold text-slate-950">Giao dịch đã hoàn tất</h4>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Gói dịch vụ <b>{product.name}</b> đã được kích hoạt thành công. Bạn có thể sử dụng ngay trong các chatbot của mình.
            </p>
            <div className="pt-4">
              <button type="button" onClick={onClose} className="btn-swiss-primary px-6 py-2.5">
                Quay lại ứng dụng
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between text-sm text-slate-500">
          <span className="font-sans">Xác nhận thanh toán qua SePay</span>
          <button type="button" onClick={onClose} className="btn-swiss-secondary text-sm py-1.5 px-4">
            Đóng
          </button>
        </div>
    </Dialog>
  );
}
