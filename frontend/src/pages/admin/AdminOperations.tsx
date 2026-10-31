import type { AdminWorkspace } from "../../hooks/useAdminWorkspace";
import { TicketChat } from "../../components/TicketChat";
import { Badge, Panel, EmptyState } from "../../components/AdminControls";

const paymentStatus: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  SUCCESS: "Đã thanh toán",
  FAILED: "Thất bại",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã hủy",
};

export function AdminOperations({ workspace }: { workspace: AdminWorkspace }) {
  const {
    section,
    selectedTicketId,
    setSelectedTicketId,
    ticketReply,
    setTicketReply,
    ticketFiles,
    setTicketFiles,
    tickets,
    payments,
    auditLogs,
    replyTicketAdmin,
    updateTicketStatus,
    markTicketReadAdmin,
  } = workspace;
  return (<>
    {section === "tickets" && (
      <TicketChat
        tickets={tickets.data}
        selectedId={selectedTicketId}
        viewer="ADMIN"
        reply={ticketReply}
        files={ticketFiles}
        sending={replyTicketAdmin.isPending}
        onSelect={(t) => {
          setSelectedTicketId(t.id);
          if (t.admin_unread_count > 0) markTicketReadAdmin.mutate(t.id);
        }}
        onReplyChange={setTicketReply}
        onFilesChange={setTicketFiles}
        onSend={(t) => replyTicketAdmin.mutate(t)}
        onStatus={(t, st) => updateTicketStatus.mutate({ id: t.id, status: st })}
      />
    )}
    {section === "payments" && (
      <Panel title="Giao dịch thanh toán">
        {payments.data?.length === 0 && <EmptyState label="Chưa có giao dịch thanh toán." />}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-sm">
            <thead className="bg-slate-100 text-xs text-slate-500 normal-case border-b border-slate-200">
              <tr>
                <th className="p-3">Mã đơn hàng</th>
                <th className="p-3">Doanh nghiệp</th>
                <th className="p-3">Gói sản phẩm</th>
                <th className="p-3">Số tiền</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.data?.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900 select-all">{p.order_code}</td>
                  <td className="p-3 text-slate-700">{p.organization_name}</td>
                  <td className="p-3">{p.product_name}</td>
                  <td className="p-3 font-bold text-brand">
                    {p.amount.toLocaleString("vi-VN")} ₫
                  </td>
                  <td className="p-3">
                    <Badge tone={p.status === "SUCCESS" ? "green" : p.status === "PENDING" ? "amber" : "red"}>
                      {paymentStatus[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-slate-500 text-xs">
                    {new Date(p.created_at).toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    )}
    {section === "settings" && (
      <Panel title="Nhật ký kiểm toán (100 sự kiện gần nhất)">
        {auditLogs.data?.length === 0 && <EmptyState label="Chưa có nhật ký kiểm toán." />}
        <div className="divide-y divide-slate-100 font-sans text-sm">
          {auditLogs.data?.map((ev) => (
            <div key={ev.id} className="p-3.5 hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <b className="text-slate-950 font-bold">{ev.action}</b>
                <span className="text-xs text-slate-400">
                  {new Date(ev.created_at).toLocaleString("vi-VN")}
                </span>
              </div>
              <p className="text-slate-600 text-xs mt-1">
                Người thực hiện: {ev.actor_email} · Đối tượng: {ev.resource_type} ({ev.resource_id})
              </p>
              {ev.metadata_redacted && ev.metadata_redacted !== "{}" && (
                <code className="block mt-1 bg-slate-900 text-slate-200 p-2 text-xs break-all">
                  {ev.metadata_redacted}
                </code>
              )}
            </div>
          ))}
        </div>
      </Panel>
    )}
  </>);
}
