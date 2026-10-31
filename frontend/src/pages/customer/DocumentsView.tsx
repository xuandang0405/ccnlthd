import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { Eye, FileText, Trash2, Upload } from "lucide-react";

export function DocumentsView({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
    setPreviewDocId,
    documents,
    uploadDoc,
    retryDoc,
    deleteDoc,
  } = workspace;
  return (<>
    {view === "documents" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
              Kho nội dung
            </span>
            <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
              Tài liệu của bạn
            </h2>
            <p className="mt-1 text-sm text-slate-600 font-sans">
              Định dạng hỗ trợ: PDF, DOCX, XLSX (tối đa 25MB). Tài liệu cần được phê duyệt trước khi chatbot sử dụng.
            </p>
          </div>
        </div>

        <div
          className="card-swiss border-2 border-dashed border-slate-300 p-8 text-center bg-white hover:border-brand transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!uploadDoc.isPending && e.dataTransfer.files[0]) uploadDoc.mutate(e.dataTransfer.files[0]);
          }}
        >
          <FileText size={36} className="mx-auto text-slate-400 mb-3" />
          <h3 className="font-sans text-sm font-semibold normal-case text-slate-900">
            Kéo thả tệp hoặc chọn từ thiết bị
          </h3>
          <p className="text-sm text-slate-500 font-sans mt-1">
            PDF, Word (.docx) hoặc Excel (.xlsx) chứa thông tin sản phẩm, chính sách giá và thông số kỹ thuật.
          </p>

          <div className="mt-4">
            <label className="btn-swiss-primary cursor-pointer text-sm py-2.5 px-5 font-sans inline-flex items-center gap-2">
              <Upload size={14} />
              <span>{uploadDoc.isPending ? "Đang tải tệp..." : "Chọn tệp tải lên"}</span>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="sr-only"
                disabled={uploadDoc.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc.mutate(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {uploadDoc.isPending && <p className="mt-3 text-sm text-slate-600" role="status">Đang tải tệp lên, vui lòng chờ...</p>}
          {uploadDoc.isSuccess && <p className="mt-3 text-sm text-emerald-700" role="status">Tải lên thành công. Tài liệu sẽ được xử lý và duyệt trước khi chatbot sử dụng.</p>}
          {uploadDoc.isError && (
            <p className="mt-3 text-sm text-red-700" role="alert">
              Không tải được tệp: {uploadDoc.error.message}
            </p>
          )}
        </div>

        <div className="card-swiss-strong overflow-hidden bg-white">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-sans text-sm font-semibold normal-case text-slate-900">
              Danh sách tài liệu đã tải lên ({documents.data?.length ?? 0})
            </h3>
            <span className="font-sans text-xs text-slate-500">
              Chỉ tài liệu đã duyệt mới được sử dụng
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-slate-100 font-sans text-xs normal-case text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Tên tệp</th>
                  <th className="p-3.5">Dung lượng</th>
                  <th className="p-3.5">Xử lý dữ liệu</th>
                  <th className="p-3.5">Phê duyệt</th>
                  <th className="p-3.5">Ngày tải lên</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {documents.data?.map((doc) => {
                  const isDone = doc.status === "DONE";
                  const isApproved = doc.approval_status === "APPROVED";
                  const isFailed = doc.status === "FAILED";

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 font-sans max-w-xs truncate">
                        <span className="flex items-center gap-2">
                          <FileText size={15} className="text-brand shrink-0" />
                          <span className="truncate">{doc.original_name}</span>
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {(doc.size_bytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`text-xs px-2 py-0.5 border font-bold ${isDone
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : isFailed
                                ? "bg-red-50 text-red-800 border-red-300"
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                        >
                          {doc.status === "DONE" ? "Đã xử lý" : doc.status === "FAILED" ? "Xử lý lỗi" : doc.status === "PROCESSING" ? "Đang xử lý" : "Đã tải lên"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`text-xs px-2 py-0.5 border font-bold ${isApproved
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : doc.approval_status === "REJECTED"
                                ? "bg-red-50 text-red-800 border-red-300"
                                : "bg-amber-50 text-amber-800 border-amber-300"
                            }`}
                        >
                          {isApproved ? "Đã duyệt · Sẵn sàng" : doc.approval_status === "REJECTED" ? "Bị từ chối" : "Chờ duyệt"}
                        </span>
                        {doc.ai_review && (
                          <span className="ml-2 text-xs text-slate-500 font-sans">
                            Điểm đánh giá: {doc.ai_review.score}/100
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 text-xs">
                        {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        {isDone && (
                          <button
                            type="button"
                            onClick={() => setPreviewDocId(doc.id)}
                            className="btn-swiss-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"
                          >
                            <Eye size={12} />
                            <span>Xem nội dung</span>
                          </button>
                        )}

                        {isFailed && (
                          <button
                            type="button"
                            onClick={() => retryDoc.mutate(doc.id)}
                            className="btn-swiss-secondary text-xs py-1 px-2.5 text-blue-700"
                          >
                            Thử lại
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Xóa tài liệu "${doc.original_name}" khỏi kho tri thức?`)) {
                              deleteDoc.mutate(doc.id);
                            }
                          }}
                          className="btn-swiss-danger text-xs py-1 px-2"
                          title="Xóa tài liệu này"
                          aria-label={`Xóa tài liệu ${doc.original_name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {documents.isPending && <div className="p-8 text-center text-sm text-slate-600" role="status">Đang tải tài liệu...</div>}
            {documents.isError && <div className="p-8 text-center text-sm text-red-700" role="alert">Không tải được danh sách tài liệu. Vui lòng thử lại.</div>}
            {documents.isSuccess && documents.data.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-sans text-sm">
                Chưa có tài liệu nào. hãy tải tệp đầu tiên để bổ sung kiến thức cho trợ lý.
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>);
}
