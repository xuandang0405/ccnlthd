import type { AdminWorkspace } from "../../hooks/useAdminWorkspace";
import { TechnicalCard } from "../../components/TechnicalCross";
import { Badge, Panel, EmptyState } from "../../components/AdminControls";
import { ErrorState } from "../../components/Feedback";

const documentStatus: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

export function AdminDocuments({ workspace }: { workspace: AdminWorkspace }) {
  const {
    section,
    documentFilter,
    setDocumentFilter,
    documents,
    moderation,
    reviewDocument,
    aiReview,
    toggleModeration,
  } = workspace;
  return (<>
    {section === "documents" && (
      <div className="space-y-6">

        {moderation.isError && <ErrorState message={moderation.error.message} onRetry={() => void moderation.refetch()} />}
        <TechnicalCard strong className="p-5 bg-blue-50/20 border-2 border-brand flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-semibold text-slate-900">
              Duyệt tài liệu tự động bằng AI
            </h4>
            <p className="text-sm text-slate-600 mt-1">
              Khi bật, tài liệu mới được AI đánh giá và chỉ tự duyệt nếu đạt yêu cầu. Khi tắt, tài liệu phải chờ quản trị viên duyệt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleModeration.mutate(!(moderation.data?.auto_review ?? false))}
            disabled={toggleModeration.isPending || !moderation.data || moderation.isError}
            aria-pressed={moderation.data?.auto_review ?? false}
            className={`btn-swiss-primary text-sm py-2 px-5 ${moderation.data?.auto_review ? "bg-emerald-700 border-emerald-900" : "bg-slate-700 border-slate-900"
              }`}
          >
            {!moderation.data ? "Chưa có trạng thái" : toggleModeration.isPending ? "Đang cập nhật..." : moderation.data.auto_review ? "Đang bật" : "Đang tắt"}
          </button>
        </TechnicalCard>

        <Panel title="Tài liệu của doanh nghiệp">
          <div className="flex gap-2 border-b border-slate-200 p-4">
            <button type="button" onClick={() => setDocumentFilter("PENDING")} aria-pressed={documentFilter === "PENDING"} className={documentFilter === "PENDING" ? "btn-swiss-primary" : "btn-swiss-secondary"}>Chờ duyệt ({documents.data?.filter((doc) => doc.approval_status === "PENDING").length ?? 0})</button>
            <button type="button" onClick={() => setDocumentFilter("ALL")} aria-pressed={documentFilter === "ALL"} className={documentFilter === "ALL" ? "btn-swiss-primary" : "btn-swiss-secondary"}>Tất cả</button>
          </div>
          {documents.data?.length === 0 && <EmptyState label="Chưa có tài liệu nào." />}
          {documents.data && documents.data.length > 0 && documentFilter === "PENDING" && !documents.data.some((doc) => doc.approval_status === "PENDING") && <EmptyState label="Không có tài liệu đang chờ duyệt." />}
          <div className="divide-y divide-slate-200">
            {documents.data?.filter((doc) => documentFilter === "ALL" || doc.approval_status === "PENDING").map((doc) => (
              <div key={doc.id} className="p-5 font-sans text-sm space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b className="text-sm font-sans text-slate-950 block">{doc.original_name}</b>
                    <span className="text-slate-500 text-xs">
                      {doc.organization_name} · {(doc.size_bytes / 1024).toFixed(1)} KB · Tải lên {new Date(doc.created_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <Badge
                    tone={
                      doc.approval_status === "APPROVED"
                        ? "green"
                        : doc.approval_status === "REJECTED"
                          ? "red"
                          : "amber"
                    }
                  >
                    {documentStatus[doc.approval_status] ?? doc.approval_status}
                  </Badge>
                </div>

                {doc.ai_review && (
                  <div className="p-3 bg-slate-50 border border-slate-200 font-sans text-sm">
                    <b>Đánh giá AI: {doc.ai_review.score}/100 · {doc.ai_review.passed ? "Đạt" : "Cần kiểm tra"}</b>
                    <p className="mt-1 text-slate-700 font-sans">{doc.ai_review.summary}</p>
                    {doc.ai_review.issues.length > 0 && <p className="mt-1 text-slate-600">Lưu ý: {doc.ai_review.issues.join("; ")}</p>}
                  </div>
                )}

                {doc.approval_note && <p className="text-sm text-slate-600">Ghi chú duyệt: {doc.approval_note}</p>}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => aiReview.mutate(doc.id)}
                    disabled={aiReview.isPending}
                    className="btn-swiss-secondary text-sm py-1.5 px-3 font-sans"
                  >
                    {aiReview.isPending ? "Đang đánh giá..." : "Đánh giá bằng AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Duyệt tài liệu ${doc.original_name} để chatbot có thể sử dụng?`)) reviewDocument.mutate({ id: doc.id, approval_status: "APPROVED" });
                    }}
                    disabled={reviewDocument.isPending || doc.approval_status === "APPROVED"}
                    className="btn-swiss-primary text-sm py-1.5 px-3 bg-emerald-700 border-emerald-900"
                  >
                    Duyệt tài liệu
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Từ chối tài liệu ${doc.original_name}?`)) reviewDocument.mutate({ id: doc.id, approval_status: "REJECTED" });
                    }}
                    disabled={reviewDocument.isPending || doc.approval_status === "REJECTED"}
                    className="btn-swiss-danger text-sm py-1.5 px-3"
                  >
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    )}
  </>);
}
