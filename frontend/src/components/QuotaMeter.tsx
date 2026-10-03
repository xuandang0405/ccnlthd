import { AlertTriangle, ArrowUpRight, ShieldAlert } from "lucide-react";

type QuotaMeterProps = {
  remaining: number;
  planName?: string;
  onUpgradeClick?: () => void;
};

export function QuotaMeter({ remaining, planName = "FREE", onUpgradeClick }: QuotaMeterProps) {
  const safeRemaining = Math.max(0, remaining);
  const isNearExhausted = safeRemaining > 0 && safeRemaining <= 5;
  const isExhausted = safeRemaining === 0;

  return (
    <div className={`card-swiss p-5 ${isExhausted ? "border-red-600 bg-red-50/30" : isNearExhausted ? "border-amber-400 bg-amber-50/20" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="font-mono text-xs font-bold tracking-wider text-slate-600">LƯỢT CHAT MIỄN PHÍ CÒN LẠI</span>
          <div className="mt-2 flex items-baseline gap-2">
            <b className="font-mono text-4xl font-black text-slate-950">{safeRemaining.toLocaleString("vi-VN")}</b>
            <span className="text-sm text-slate-600">lượt</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">Số lượt miễn phí trong tài khoản của bạn. Gói hiện tại: {planName}.</p>
        </div>
        {onUpgradeClick && (
          <button type="button" onClick={onUpgradeClick} className="btn-swiss-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
            MUA THÊM LƯỢT <ArrowUpRight size={14} />
          </button>
        )}
      </div>

      {isNearExhausted && (
        <div className="mt-4 flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>Bạn còn {safeRemaining} lượt miễn phí. Có thể mua thêm lượt để tiếp tục sử dụng sau khi hết.</span>
        </div>
      )}
      {isExhausted && (
        <div className="mt-4 flex items-start gap-2 border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="status">
          <ShieldAlert size={17} className="shrink-0 mt-0.5" />
          <span>Đã hết lượt miễn phí. Hãy dùng lượt đã mua hoặc mua thêm lượt chat.</span>
        </div>
      )}
    </div>
  );
}
