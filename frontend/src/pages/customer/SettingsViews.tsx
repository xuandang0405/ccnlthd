import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { Link } from "react-router-dom";
import { RequestIdHelper } from "../../components/RequestIdDisplay";
import { TechnicalCard } from "../../components/TechnicalCross";
import { TopStatusBar } from "../../components/TopStatusBar";

export function SettingsViews({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
    setShowArchModal,
    newLeads,
    updateLead,
  } = workspace;
  return (<>
    {view === "settings" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="border-b border-slate-200 pb-5">
          <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
            Khách đang cần tư vấn
          </span>
          <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
            Thông báo trên website
          </h2>
          <p className="mt-1 text-sm text-slate-600 font-sans">
            Theo dõi khách hàng mới để lại liên hệ từ chatbot của bạn.
          </p>
        </div>

        <TechnicalCard strong className="p-6 bg-white max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <h3 className="font-semibold text-slate-900" aria-live="polite">
              {newLeads.isError ? "Chưa tải được thông báo" : `${newLeads.data?.total ?? "…"} khách hàng mới chờ xử lý`}
            </h3>
            <button type="button" className="btn-swiss-secondary" onClick={() => void newLeads.refetch()} disabled={newLeads.isFetching}>
              {newLeads.isFetching ? "Đang cập nhật..." : "Làm mới"}
            </button>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Tự cập nhật mỗi 15 giây khi bạn đang mở web. Thông báo được tính theo khách có trạng thái Mới,
            không phải số tin nhắn chưa đọc. Xem thông báo không tự đổi trạng thái khách hàng.
          </p>
          <div className="divide-y divide-slate-200">
            {newLeads.data?.items.map((lead) => (
              <article key={lead.id} className="space-y-2 py-4">
                <h4 className="font-semibold text-slate-900 break-words">{lead.customer_name || "Khách chưa đặt tên"}</h4>
                <p className="text-sm text-slate-700 break-words">{[lead.phone, lead.email].filter(Boolean).join(" · ")}</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{lead.intent_summary || "Khách muốn được liên hệ tư vấn."}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <time className="text-xs text-slate-500" dateTime={lead.created_at}>{new Date(lead.created_at).toLocaleString("vi-VN")}</time>
                  <button type="button" className="btn-swiss-secondary" disabled={updateLead.isPending} onClick={() => updateLead.mutate({ id: lead.id, status: "CONTACTED" })}>
                    Đánh dấu đã liên hệ
                  </button>
                </div>
              </article>
            ))}
          </div>
          {newLeads.isSuccess && newLeads.data.total === 0 && <p className="py-6 text-sm text-slate-600" role="status">Chưa có khách hàng mới chờ xử lý.</p>}
          <p className="text-sm text-slate-600">Hiển thị tối đa 5 khách mới nhất. Thông tin đã lưu vẫn còn khi bạn đăng nhập lại.</p>
          <Link to="/app?view=leads" className="btn-swiss-primary">Xem toàn bộ khách hàng</Link>
        </TechnicalCard>
      </div>
    )}
    {view === "observability" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="border-b border-slate-200 pb-5">
          <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
            Dành cho kiểm tra kỹ thuật
          </span>
          <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
            Nhật ký hệ thống
          </h2>
          <p className="mt-1 text-sm text-slate-600 font-sans">
            Công cụ hỗ trợ thuyết trình và gỡ lỗi sự cố trong quá trình kiểm thử hoặc bảo vệ đồ án.
          </p>
        </div>

        <TopStatusBar />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setShowArchModal(true)} className="btn-swiss-secondary">Xem kiến trúc đồ án</button>
          <a href="/docs" target="_blank" rel="noreferrer" className="btn-swiss-secondary">Mở tài liệu API</a>
        </div>

        <RequestIdHelper />
      </div>
    )}
  </>);
}
