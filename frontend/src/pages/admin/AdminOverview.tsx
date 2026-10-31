import type { AdminWorkspace } from "../../hooks/useAdminWorkspace";
import { RequestIdHelper } from "../../components/RequestIdDisplay";
import { TopStatusBar } from "../../components/TopStatusBar";
import type { AdminSection as Section } from "../../config/site";

export function AdminOverview({ workspace }: { workspace: AdminWorkspace }) {
  const {
    section,
    setSection,
    summary,
    metricCards,
  } = workspace;
  return (<>
    {section === "overview" && (
      <div className="space-y-6">
        <TopStatusBar />
        <div className="workspace-intro p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-slate-950">Cần xử lý</h3>
          <p className="mt-1 text-sm text-slate-600">Các việc đang chờ trong toàn hệ thống.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {([
              ["Tài liệu chờ duyệt", summary.data?.documents_pending_review ?? 0, "documents"],
              ["Ticket chưa đọc", summary.data?.tickets_unread ?? 0, "tickets"],
              ["Thanh toán đang chờ", summary.data?.payments_pending ?? 0, "payments"],
            ] as Array<[string, number, Section]>).map(([label, count, target]) => (
              <button key={label} type="button" onClick={() => setSection(target)} className="border border-blue-100 bg-white p-4 text-left hover:border-blue-400">
                <span className="block text-sm text-slate-600">{label}</span>
                <strong className="mt-2 block text-2xl text-slate-950">{count.toLocaleString("vi-VN")}</strong>
                <span className="mt-2 block text-sm font-semibold text-blue-700">Mở mục này →</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">Yêu cầu hỗ trợ đang mở: <strong>{summary.data?.tickets_open ?? 0}</strong></p>
        </div>

        <h3 className="text-lg font-semibold text-slate-950">Toàn hệ thống</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map(([label, val, target]) => (
            <div key={label} className="card-swiss bg-white p-5">
              <span className="text-sm font-medium text-slate-600">{label}</span>
              <strong className="text-3xl font-bold tracking-tight text-slate-950 mt-3 block">{val.toLocaleString("vi-VN")}</strong>
              {target && <button type="button" onClick={() => setSection(target)} className="mt-3 text-sm font-semibold text-blue-700 hover:underline">Xem chi tiết →</button>}
            </div>
          ))}
        </div>

        <RequestIdHelper />
      </div>
    )}
  </>);
}
