import { Link, Navigate } from "react-router-dom";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { PaymentModal } from "../components/PaymentModal";
import { SystemArchitectureModal } from "../components/SystemArchitectureModal";
import { WorkspaceLayout } from "../components/WorkspaceLayout";
import { ErrorState, LoadingState } from "../components/Feedback";
import { customerNavigation } from "../config/site";
import { useCustomerWorkspace } from "../hooks/useCustomerWorkspace";
import { OverviewView } from "./customer/OverviewView";
import { ChatbotViews } from "./customer/ChatbotViews";
import { DocumentsView } from "./customer/DocumentsView";
import { ConversationViews } from "./customer/ConversationViews";
import { BillingView } from "./customer/BillingView";
import { SupportView } from "./customer/SupportView";
import { SettingsViews } from "./customer/SettingsViews";
import { LeadNotificationLink } from "../components/LeadNotificationLink";
export function DashboardPage() {
  const workspace = useCustomerWorkspace();
  const {
    user,
    organizationId,
    logout,
    view,
    currentOrg,
    globalSearch,
    setGlobalSearch,
  } = workspace;
  if (!user || !organizationId) return <Navigate to="/login" replace />;
  const activeQuery = { overview: workspace.summary, "ai-workspace": workspace.chatbots, chatbots: workspace.chatbots, documents: workspace.documents, conversations: workspace.conversations, leads: workspace.leads, payment: workspace.products, support: workspace.tickets, settings: workspace.newLeads, observability: workspace.summary }[view];
  const actionError = [workspace.allocateCredits, workspace.deleteChatbot, workspace.deleteDoc, workspace.retryDoc, workspace.updateLead, workspace.replyTicket].find((action) => action.isError)?.error;
  return (
    <WorkspaceLayout navigation={customerNavigation} activeId={view} workspaceName={currentOrg?.name || "Không gian làm việc"} userName={user.full_name} userEmail={user.email} onLogout={logout} actions={<>
      <LeadNotificationLink count={workspace.summary.data?.new_lead_count} loading={workspace.summary.isPending} failed={workspace.summary.isError} />
      {user.is_super_admin && <Link to="/admin" className="btn-swiss-secondary">Trang quản trị</Link>}
    </>}>
      {(view === "conversations" || view === "leads") && <div className="search-toolbar"><label htmlFor="customer-search">Tìm kiếm</label><input id="customer-search" type="search" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder={view === "conversations" ? "Nhập nội dung khách đã hỏi..." : "Nhập tên, email, số điện thoại hoặc nhu cầu..."} className="input-swiss" /></div>}
      {activeQuery.isPending && <LoadingState />}
      {activeQuery.isError && <ErrorState message={activeQuery.error.message} onRetry={() => void activeQuery.refetch()} />}
      {actionError && <ErrorState message={actionError.message} />}
      <OverviewView workspace={workspace} />
      <ChatbotViews workspace={workspace} />
      <DocumentsView workspace={workspace} />
      <ConversationViews workspace={workspace} />
      <BillingView workspace={workspace} />
      <SupportView workspace={workspace} />
      <SettingsViews workspace={workspace} />
      <DocumentPreviewModal documentId={workspace.previewDocId} onClose={() => workspace.setPreviewDocId(null)} />
      <PaymentModal key={workspace.checkoutProduct?.code ?? "closed"} product={workspace.checkoutProduct} onClose={() => workspace.setCheckoutProduct(null)} />
      <SystemArchitectureModal isOpen={workspace.showArchModal} onClose={() => workspace.setShowArchModal(false)} />
    </WorkspaceLayout>
  );
}
