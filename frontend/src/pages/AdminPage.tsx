import { Link, Navigate } from "react-router-dom";
import { WorkspaceLayout } from "../components/WorkspaceLayout";
import { LoadingState, ErrorState } from "../components/Feedback";
import { adminNavigation, type AdminSection } from "../config/site";
import { useAdminWorkspace } from "../hooks/useAdminWorkspace";
import { AdminOverview } from "./admin/AdminOverview";
import { AdminAccounts } from "./admin/AdminAccounts";
import { AdminChatbots } from "./admin/AdminChatbots";
import { AdminDocuments } from "./admin/AdminDocuments";
import { AdminOperations } from "./admin/AdminOperations";

const sectionCopy: Record<AdminSection, string> = {
  overview: "Sức khỏe vận hành toàn hệ thống và các công việc đang chờ giải quyết.",
  organizations: "Xem và quản lý trạng thái hoạt động của từng doanh nghiệp.",
  users: "Quản lý tài khoản, quyền truy cập, lượt dùng và số vị trí chatbot.",
  chatbots: "Xem, chỉnh sửa và quản lý lượt dùng của chatbot thuộc các doanh nghiệp.",
  documents: "Kiểm tra tài liệu trước khi cho phép chatbot sử dụng.",
  tickets: "Tiếp nhận và trả lời yêu cầu hỗ trợ của khách hàng.",
  payments: "Theo dõi đơn hàng và trạng thái thanh toán qua VietQR.",
  settings: "Xem lại các thao tác quản trị gần đây.",
};

export function AdminPage() {
  const workspace = useAdminWorkspace();
  const {
    user,
    logout,
    section,
    summary,
    activeQuery,
    actionError,
  } = workspace;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_super_admin) return <Navigate to="/app" replace />;
  return (
    <WorkspaceLayout navigation={adminNavigation} activeId={section} workspaceName="Quản trị hệ thống" userName={user.full_name} userEmail={user.email} admin unreadTickets={summary.data?.tickets_unread} onLogout={logout} actions={user.organizations.length > 0 && <Link to="/app" className="btn-swiss-secondary">Khu khách hàng</Link>}>
      <div className="mb-7">
        <p className="section-eyebrow">Quản trị hệ thống</p>
        <h1 className="mt-2 text-3xl">{adminNavigation.find((item) => item.id === section)?.label}</h1>
        <p className="mt-2 text-sm text-slate-600">{sectionCopy[section]}</p>
      </div>
      {activeQuery.isPending && <LoadingState label="Đang tải dữ liệu quản trị..." />}
      {activeQuery.isError && <ErrorState message={activeQuery.error.message} onRetry={() => void activeQuery.refetch()} />}
      {actionError && <ErrorState message={actionError.message} />}
      <AdminOverview workspace={workspace} />
      <AdminAccounts workspace={workspace} />
      <AdminChatbots workspace={workspace} />
      <AdminDocuments workspace={workspace} />
      <AdminOperations workspace={workspace} />
    </WorkspaceLayout>
  );
}
