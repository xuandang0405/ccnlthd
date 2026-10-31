import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { QuotaMeter } from "../../components/QuotaMeter";
import type { CustomerView as View } from "../../config/site";

export function OverviewView({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
    setView,
    summary,
    documents,
    availableSlots,
    pendingDocumentCount,
  } = workspace;
  return (<>
    {view === "overview" && (
      <div className="mx-auto max-w-5xl space-y-6">

        <div className="workspace-intro grid gap-7 p-6 lg:grid-cols-[1.25fr_.75fr] lg:p-8">
          <div>
            <p className="section-eyebrow">Không gian làm việc</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950">Quản lý trợ lý bán hàng</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700">
              Tạo chatbot, thêm tài liệu đã duyệt và thử câu trả lời trước khi đặt lên website.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setView("chatbots")} className="btn-swiss-primary">Quản lý chatbot</button>
              <button type="button" onClick={() => setView("documents")} className="btn-swiss-secondary">Tài liệu</button>
              <button type="button" onClick={() => setView("ai-workspace")} className="btn-swiss-secondary">Thử trò chuyện</button>
            </div>
          </div>
          <div className="border border-blue-100 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Cần chú ý</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p className="flex justify-between gap-4"><span>Vị trí chatbot còn trống</span><strong className="text-slate-950">{summary.isPending ? "..." : availableSlots}</strong></p>
              <p className="flex justify-between gap-4"><span>Tài liệu chờ duyệt</span><strong className="text-slate-950">{documents.isPending ? "..." : pendingDocumentCount}</strong></p>
            </div>
            <button type="button" onClick={() => setView("documents")} className="mt-5 text-sm font-semibold text-blue-700 hover:underline">Xem tài liệu →</button>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-900">Lượt chat còn lại</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {summary.data && (
            <QuotaMeter
              remaining={summary.data.free_credits_remaining}
              planName={summary.data.current_plan}
              onUpgradeClick={() => setView("payment")}
            />
          )}
          <div className="card-swiss p-5">
            <h2 className="font-semibold text-slate-900">Lượt chat đã mua</h2>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {summary.data ? summary.data.purchased_credits_remaining.toLocaleString("vi-VN") : "—"}
            </p>
            <button type="button" onClick={() => setView("payment")} className="mt-3 text-sm text-blue-700 underline">
              Mua hoặc phân bổ lượt
            </button>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-900">Hoạt động của bạn</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["Chatbot", summary.data?.chatbot_count ?? 0, "chatbots"],
            ["Tài liệu", summary.data?.document_count ?? 0, "documents"],
            ["Hội thoại", summary.data?.conversation_count ?? 0, "conversations"],
            ["Khách hàng", summary.data?.new_lead_count ?? 0, "leads"],
          ] as Array<[string, number, View]>).map(([label, count, target]) => (
            <button
              key={label}
              type="button"
              onClick={() => setView(target)}
              className="card-swiss workspace-stat p-5 text-left"
            >
              <span className="block text-sm text-slate-600">{label}</span>
              <strong className="mt-2 block text-2xl">{summary.data ? count.toLocaleString("vi-VN") : "—"}</strong>
              <span className="mt-2 block text-sm text-blue-700 underline">Xem chi tiết</span>
            </button>
          ))}
        </div>
      </div>
    )}
  </>);
}
