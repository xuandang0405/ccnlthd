import { Dialog } from "./Dialog";
import { useQuery } from "@tanstack/react-query";
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
    <Dialog title="Nội dung tài liệu" description={preview.data?.original_name || "Nội dung đã trích xuất từ tài liệu"} onClose={onClose} className="max-w-3xl">
        <div className="p-6 overflow-y-auto flex-1 font-sans text-sm leading-relaxed text-slate-800 bg-[#F8FAFC]">
          {preview.isLoading && (
            <div className="py-12 text-center text-slate-500">
              <span className="inline-block animate-pulse">Đang tải nội dung đã trích xuất từ tài liệu...</span>
            </div>
          )}

          {preview.isError && (
            <div role="alert" className="p-4 bg-red-50 border border-red-300 text-red-800">
              <b>Lỗi trích xuất:</b> {preview.error.message}
            </div>
          )}

          {preview.data && !preview.data.content && (
            <div className="p-8 text-center text-slate-500 bg-white border border-slate-200">
              <p className="font-sans font-semibold">Tài liệu chưa có nội dung văn bản được trích xuất.</p>
              <p className="text-sm text-slate-400 mt-1 font-sans">
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

        <div className="border-t border-slate-200 px-5 py-3 bg-white flex justify-between items-center text-sm text-slate-500">
          <span>Hiển thị tối đa 20.000 ký tự đầu của tài liệu</span>
          <button type="button" onClick={onClose} className="btn-swiss-secondary text-sm py-1.5 px-4">
            Đóng
          </button>
        </div>
    </Dialog>
  );
}
