import { useQuery } from "@tanstack/react-query";
import { FileText, X } from "lucide-react";
import { api } from "../services/api";

type DocumentPreview = {
  id: string;
  original_name: string;
  status: string;
  content: string | null;
};

type DocumentPreviewModalProps = {
  documentId: string | null;
  onClose: () => void;
};

export function DocumentPreviewModal({ documentId, onClose }: DocumentPreviewModalProps) {
  const preview = useQuery({
    queryKey: ["document-preview", documentId],
    queryFn: () => api<DocumentPreview>(`/documents/${documentId}/preview`),
    enabled: !!documentId,
  });

  if (!documentId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="card-swiss-strong w-full max-w-3xl max-h-[85vh] flex flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-[#0F172A] px-5 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-[#0052FF] text-white">
              <FileText size={16} />
            </span>
            <div>
              <h3 className="font-black text-sm text-slate-950 uppercase tracking-wider font-mono">
                DOCUMENT PREVIEW // TRÍCH XUẤT VĂN BẢN
              </h3>
              <p className="text-xs text-slate-600 truncate max-w-md">
                {preview.data?.original_name || "Đang tải tên tài liệu..."}
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

        {/* MODAL CONTENT */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs leading-relaxed text-slate-800 bg-[#F8FAFC]">
          {preview.isLoading && (
            <div className="py-12 text-center text-slate-500">
              <span className="inline-block animate-pulse">Đang tải nội dung đã trích xuất từ tài liệu...</span>
            </div>
          )}

          {preview.isError && (
            <div className="p-4 bg-red-50 border border-red-300 text-red-800">
              <b>Lỗi trích xuất:</b> {preview.error.message}
            </div>
          )}

          {preview.data && !preview.data.content && (
            <div className="p-8 text-center text-slate-500 bg-white border border-slate-200">
              <p className="font-sans font-semibold">Tài liệu chưa có nội dung văn bản được trích xuất.</p>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Trạng thái tài liệu: {preview.data.status}. Chỉ tài liệu đã qua xử lý (DONE) mới có văn bản trích xuất.
              </p>
            </div>
          )}

          {preview.data?.content && (
            <div className="bg-white border border-slate-300 p-4 whitespace-pre-wrap select-text">
              {preview.data.content}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="border-t border-slate-200 px-5 py-3 bg-white flex justify-between items-center text-xs text-slate-500">
          <span>Tối đa 20.000 ký tự đầu tiên được lập chỉ mục vector</span>
          <button type="button" onClick={onClose} className="btn-swiss-secondary text-xs py-1.5 px-4">
            ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
}
