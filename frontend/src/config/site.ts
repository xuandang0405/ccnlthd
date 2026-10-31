import logoFull from "../../img/logo.png";
import logoIcon from "../../img/logo-2.png";

export const siteConfig = {
  name: "Trợ lý Việt",
  slogan: '"Khách không phải người yêu, nhưng phải được chiều"',
  logoFull,
  logoIcon,
  tagline: "Cho thuê chatbot tư vấn bán hàng",
  description: "Trợ lý Việt giúp bạn thuê và quản lý chatbot tư vấn bán hàng từ tài liệu sản phẩm, hỗ trợ khách hàng ngay trên website.",
};

export type CustomerView = "overview" | "ai-workspace" | "chatbots" | "documents" | "conversations" | "leads" | "payment" | "support" | "settings" | "observability";
export type AdminSection = "overview" | "organizations" | "users" | "chatbots" | "documents" | "tickets" | "payments" | "settings";

export type NavigationItem = { id: string; label: string; group: string; href: string };

export const customerNavigation: Array<NavigationItem & { id: CustomerView }> = [
  { id: "overview", label: "Tổng quan", group: "Không gian làm việc", href: "/app" },
  { id: "chatbots", label: "Chatbot của tôi", group: "Không gian làm việc", href: "/app?view=chatbots" },
  { id: "documents", label: "Tài liệu", group: "Không gian làm việc", href: "/app?view=documents" },
  { id: "ai-workspace", label: "Thử trợ lý AI", group: "Không gian làm việc", href: "/app?view=ai-workspace" },
  { id: "conversations", label: "Hội thoại", group: "Khách hàng", href: "/app?view=conversations" },
  { id: "leads", label: "Khách hàng tiềm năng", group: "Khách hàng", href: "/app?view=leads" },
  { id: "payment", label: "Gói & thanh toán", group: "Tài khoản", href: "/app?view=payment" },
  { id: "support", label: "Hỗ trợ", group: "Tài khoản", href: "/app?view=support" },
  { id: "settings", label: "Thông báo", group: "Tài khoản", href: "/app?view=settings" },
  { id: "observability", label: "Kiểm tra hệ thống", group: "Tài khoản", href: "/app?view=observability" },
];

export const adminNavigation: Array<NavigationItem & { id: AdminSection }> = [
  { id: "overview", label: "Tổng quan", group: "Quản trị", href: "/admin" },
  { id: "organizations", label: "Doanh nghiệp", group: "Quản trị", href: "/admin?section=organizations" },
  { id: "users", label: "Người dùng", group: "Quản trị", href: "/admin?section=users" },
  { id: "chatbots", label: "Chatbot", group: "Quản trị", href: "/admin?section=chatbots" },
  { id: "documents", label: "Duyệt tài liệu", group: "Vận hành", href: "/admin?section=documents" },
  { id: "tickets", label: "Hỗ trợ khách hàng", group: "Vận hành", href: "/admin?section=tickets" },
  { id: "payments", label: "Thanh toán", group: "Vận hành", href: "/admin?section=payments" },
  { id: "settings", label: "Nhật ký quản trị", group: "Vận hành", href: "/admin?section=settings" },
];
