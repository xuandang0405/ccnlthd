import type { CustomerWorkspace } from "../../hooks/useCustomerWorkspace";
import { Lead } from "../../types";
import { PageControls } from "../../components/WorkspaceControls";

export function ConversationViews({ workspace }: { workspace: CustomerWorkspace }) {
  const {
    view,
    searchTerm,
    conversationPage,
    setConversationPage,
    leadPage,
    setLeadPage,
    selectedConversationId,
    setSelectedConversationId,
    conversations,
    conversationDetail,
    leads,
    updateLead,
  } = workspace;
  return (<>
    {view === "conversations" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
              Lắng nghe khách hàng
            </span>
            <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
              Hội thoại khách hàng
            </h2>
            <p className="mt-1 text-sm text-slate-600 font-sans">
              Tìm kiếm và xem từng trang hội thoại giữa khách truy cập và trợ lý AI.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {conversations.isPending && <div className="card-swiss p-8 text-center text-sm text-slate-600" role="status">Đang tải hội thoại...</div>}
          {conversations.isError && <div className="card-swiss p-8 text-center text-sm text-red-700" role="alert">Không tải được hội thoại. Vui lòng thử lại.</div>}
          {conversations.data?.items.map((item) => {
            const isOpened = selectedConversationId === item.id;
            return (
              <div key={item.id} className="card-swiss p-5 border-slate-300 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-sans text-sm">
                      <b className="text-slate-900 font-sans">{item.chatbot_name}</b>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">
                        {new Date(item.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-sans text-slate-700">
                      <span className="font-bold text-slate-900 font-sans">Khách hỏi:</span>{" "}
                      {item.first_question || "Khách chưa nhập tin nhắn"}
                    </p>
                    <p className="mt-1 text-xs font-sans text-slate-400 select-all">
                      Mã hội thoại: {item.id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedConversationId(isOpened ? null : item.id)}
                    className="btn-swiss-secondary text-sm py-1.5 px-3 font-sans"
                  >
                    {isOpened ? "Ẩn tin nhắn" : "Xem chi tiết"}
                  </button>
                </div>

                {isOpened && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 bg-slate-50 p-4">
                    {conversationDetail.isLoading && (
                      <p className="text-sm font-sans text-slate-500">Đang tải lịch sử tin nhắn...</p>
                    )}
                    {conversationDetail.isError && <p className="text-sm text-red-700" role="alert">Không tải được tin nhắn của cuộc hội thoại này.</p>}
                    {conversationDetail.data?.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 text-sm leading-relaxed ${msg.role === "USER"
                            ? "bg-white border border-slate-300 text-slate-900"
                            : "chat-ai-message text-slate-900"
                          }`}
                      >
                        <div className="flex items-center justify-between font-sans text-xs text-slate-400 mb-1">
                          <b className="text-slate-700">{msg.role === "USER" ? "Khách hàng" : "Trợ lý ảo"}</b>
                          <span>{new Date(msg.created_at).toLocaleTimeString("vi-VN", { hour12: false })}</span>
                        </div>
                        <p className="font-sans whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {conversations.isSuccess && conversations.data.total === 0 && (
            <div className="card-swiss p-12 text-center text-slate-400 font-sans text-sm">
              {searchTerm ? "Không tìm thấy hội thoại phù hợp." : "Chưa có cuộc hội thoại nào từ khách truy cập."}
            </div>
          )}
        </div>
        {conversations.data && <PageControls page={conversationPage} pageSize={conversations.data.page_size} total={conversations.data.total} onPageChange={(page) => { setConversationPage(page); setSelectedConversationId(null); }} />}
      </div>
    )}
    {view === "leads" && (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <span className="font-sans text-sm font-bold text-brand normal-case tracking-wider block">
              Khách muốn được tư vấn
            </span>
            <h2 className="mt-1 text-2xl font-semibold font-sans normal-case text-slate-950">
              Khách hàng tiềm năng
            </h2>
            <p className="mt-1 text-sm text-slate-600 font-sans">
              Thông tin do khách hàng tự nguyện để lại qua widget chat để yêu cầu tư vấn báo giá.
            </p>
          </div>

          <span className="font-sans text-sm bg-white border border-slate-300 px-3 py-1.5">
            Tổng cộng: <b>{leads.data?.total ?? 0}</b> LEADS
          </span>
        </div>

        <div className="card-swiss-strong overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-slate-100 font-sans text-xs normal-case text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Tên khách</th>
                  <th className="p-3.5">Liên hệ</th>
                  <th className="p-3.5">Nhu cầu / ý định</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5">Thời gian</th>
                  <th className="p-3.5 text-right">Cập nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.data?.items.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-950">
                      {lead.customer_name || "Khách chưa đặt tên"}
                    </td>
                    <td className="p-3.5 font-sans text-slate-700">
                      <div>{lead.phone || "—"}</div>
                      <div className="text-xs text-slate-400">{lead.email || ""}</div>
                    </td>
                    <td className="p-3.5 max-w-xs text-slate-600 truncate">
                      {lead.intent_summary || "Chưa có tóm tắt"}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`font-sans text-xs px-2 py-0.5 border font-bold ${lead.status === "NEW"
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : lead.status === "QUALIFIED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : lead.status === "CLOSED"
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-slate-100 text-slate-600 border-slate-300"
                          }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-3.5 font-sans text-xs text-slate-500">
                      {new Date(lead.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-3.5 text-right">
                      <select
                        aria-label={`Trạng thái khách hàng ${lead.customer_name || lead.id}`}
                        value={lead.status}
                        onChange={(e) =>
                          updateLead.mutate({
                            id: lead.id,
                            status: e.target.value as Lead["status"],
                          })
                        }
                        className="input-swiss text-sm font-sans py-1 px-2 w-auto bg-white font-bold"
                      >
                        <option value="NEW">Mới (new)</option>
                        <option value="CONTACTED">Đã liên hệ</option>
                        <option value="QUALIFIED">Tiềm năng</option>
                        <option value="CLOSED">Đã chốt đơn</option>
                        <option value="LOST">Không thành công</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {leads.isPending && <div className="p-8 text-center text-sm text-slate-600" role="status">Đang tải khách hàng...</div>}
            {leads.isError && <div className="p-8 text-center text-sm text-red-700" role="alert">Không tải được danh sách khách hàng. Vui lòng thử lại.</div>}
            {leads.isSuccess && leads.data.items.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-sans text-sm">
                {searchTerm ? "Không tìm thấy khách hàng phù hợp." : "Chưa có khách hàng nào để lại thông tin."}
              </div>
            )}
          </div>
        </div>
        {leads.data && <PageControls page={leadPage} pageSize={leads.data.page_size} total={leads.data.total} onPageChange={setLeadPage} />}
      </div>
    )}
  </>);
}
