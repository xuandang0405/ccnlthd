import { Link } from "react-router-dom";

type LeadNotificationLinkProps = {
  count: number | undefined;
  loading: boolean;
  failed: boolean;
};

export function LeadNotificationLink({ count, loading, failed }: LeadNotificationLinkProps) {
  let label = "Đang tải thông báo";
  let indicator = "…";
  if (failed) {
    label = "Không tải được thông báo. Mở trang thông báo để thử lại";
    indicator = "!";
  } else if (!loading && count !== undefined) {
    label = `Thông báo: ${count} khách hàng mới chờ xử lý`;
    indicator = count.toLocaleString("vi-VN");
  }

  return (
    <Link to="/app?view=settings" className="btn-swiss-secondary gap-2" aria-label={label}>
      <span>Thông báo</span>
      <span className="sidebar-count" aria-live="polite" aria-atomic="true">{indicator}</span>
    </Link>
  );
}
