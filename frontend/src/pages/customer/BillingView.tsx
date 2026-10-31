import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { QrCode } from "lucide-react";
import { TechnicalCard } from "../../components/TechnicalCross";
import { EmptyState, ErrorState, LoadingState } from "../../components/Feedback";

export function BillingView({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
    setCheckoutProduct,
    products,
    balance,
  } = workspace;
  return (<>
    {view === "payment" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="border-b border-slate-200 pb-5">
          <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
            Lượt chat và gói dịch vụ
          </span>
          <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
            Thanh toán
          </h2>
          <p className="mt-1 text-sm text-slate-600 font-sans">
            Mua thêm vị trí Chatbot hoặc gói lượt chat vĩnh viễn. Thanh toán tự động quét mã VietQR.
          </p>
        </div>

        {balance.isPending && <LoadingState label="Đang tải số dư và vị trí chatbot..." />}
        {balance.isError && <ErrorState message={balance.error.message} onRetry={() => void balance.refetch()} />}
        {balance.data && <div className="grid gap-4 sm:grid-cols-3 font-sans">
          <div className="card-swiss p-5 bg-white border-slate-300">
            <span className="text-sm text-slate-600 block">Lượt miễn phí còn lại</span>
            <b className="text-2xl text-slate-950 mt-1 block">
              {(balance.data?.free_remaining ?? 0).toLocaleString("vi-VN")}
            </b>
            <p className="text-sm text-slate-500 mt-1">Không tự làm mới hằng ngày</p>
          </div>

          <div className="card-swiss p-5 bg-white border-slate-300">
            <span className="text-xs text-slate-500 normal-case block">Ví lượt đã mua (vĩnh viễn)</span>
            <b className="text-2xl text-brand mt-1 block">
              {(balance.data?.purchased_remaining ?? 0).toLocaleString("vi-VN")}
            </b>
            <p className="text-xs text-slate-400 mt-1 font-sans">Dùng chung hoặc phân bổ cho bot</p>
          </div>

          <div className="card-swiss p-5 bg-white border-slate-300">
            <span className="text-xs text-slate-500 normal-case block">Vị trí chatbot</span>
            <b className="text-2xl text-slate-950 mt-1 block">
              {balance.data?.chatbot_count ?? 0}/{balance.data?.chatbot_slots ?? 1}
            </b>
            <p className="text-xs text-slate-400 mt-1 font-sans">Số bot tối đa được phép tạo</p>
          </div>
        </div>}

        <div>
          <h3 className="font-sans text-sm font-semibold normal-case text-slate-900 mb-3">
            Chọn gói dịch vụ để mua
          </h3>
          {products.isSuccess && products.data.length === 0 && <EmptyState title="Chưa có gói dịch vụ" description="Hiện máy chủ chưa cung cấp gói mua thêm. Bạn có thể liên hệ trong mục Hỗ trợ." />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.data?.map((prod) => (
              <TechnicalCard
                key={prod.code}
                className="p-5 flex flex-col justify-between hover:border-brand transition-colors bg-white"
              >
                <div>
                  <div className="flex items-center justify-between font-sans text-xs">
                    <span className="font-bold text-slate-500 normal-case">{prod.code}</span>
                    <span className="bg-blue-50 text-blue-800 px-1.5 py-0.2 border border-blue-200">
                      {prod.product_type === "CHATBOT_SLOT" ? "Vị trí chatbot" : "Lượt chat"}
                    </span>
                  </div>
                  <h4 className="mt-2 font-semibold text-sm text-slate-950 font-sans">{prod.name}</h4>
                  <p className="mt-1 text-sm text-slate-600 font-sans">{prod.description}</p>
                  <div className="mt-4 font-sans text-2xl font-semibold text-brand">
                    {prod.price_vnd.toLocaleString("vi-VN")} ₫
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCheckoutProduct(prod)}
                    className="btn-swiss-primary w-full text-sm py-2.5 font-sans inline-flex items-center justify-center gap-2"
                  >
                    <QrCode size={14} />
                    <span>Mua gói này</span>
                  </button>
                </div>
              </TechnicalCard>
            ))}
          </div>
        </div>
      </div>
    )}
  </>);
}
