import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NavigationItem } from "../config/site";
import { Brand } from "./Brand";

type WorkspaceLayoutProps = {
  navigation: NavigationItem[];
  activeId: string;
  workspaceName: string;
  userName: string;
  userEmail: string;
  admin?: boolean;
  unreadTickets?: number;
  actions?: ReactNode;
  children: ReactNode;
  onLogout: () => Promise<void>;
};

export function WorkspaceLayout({ navigation, activeId, workspaceName, userName, userEmail, admin = false, unreadTickets = 0, actions, children, onLogout }: WorkspaceLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (menuOpen) sidebarRef.current?.querySelector<HTMLAnchorElement>(".sidebar-link")?.focus();
  }, [menuOpen]);
  const groups = [...new Set(navigation.map((item) => item.group))];
  const pageName = navigation.find((item) => item.id === activeId)?.label;

  return (
    <div className={`workspace-shell ${admin ? "admin-shell" : "customer-shell"}`}>
      <a href="#workspace-content" className="skip-link">Đến nội dung chính</a>
      <aside ref={sidebarRef} id="workspace-navigation" className={`workspace-sidebar ${menuOpen ? "is-open" : ""}`} onKeyDown={(event) => {
        if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
      }}>
        <div className="sidebar-brand"><Brand /><span className="sidebar-subtitle">{admin ? "Quản trị hệ thống" : "Không gian làm việc"}</span></div>
        <nav aria-label={admin ? "Mục quản trị" : "Mục tài khoản"}>
          {groups.map((group) => (
            <div className="sidebar-group" key={group}>
              <p className="sidebar-group-label">{group}</p>
              {navigation.filter((item) => item.group === group).map((item) => (
                <Link key={item.id} to={item.href} aria-current={activeId === item.id ? "page" : undefined} onClick={() => { setMenuOpen(false); if (menuOpen) menuButtonRef.current?.focus(); }} className="sidebar-link">
                  <span>{item.label}</span>
                  {item.id === "tickets" && unreadTickets > 0 && <span className="sidebar-count" aria-label={`${unreadTickets} yêu cầu chưa đọc`}>{unreadTickets}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-account"><strong>{userName}</strong><span>{userEmail}</span><span className="account-role">{admin ? "Quản trị viên" : "Tài khoản khách hàng"}</span></div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="mobile-workspace-brand"><Brand variant="icon" /></div>
          <button ref={menuButtonRef} type="button" className="mobile-menu btn-swiss-secondary" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="workspace-navigation" aria-label={menuOpen ? "Đóng menu" : "Mở menu"}>{menuOpen ? <X size={18} /> : <Menu size={18} />}<span>Menu</span></button>
          <div className="workspace-breadcrumb"><span>{workspaceName}</span><span aria-hidden="true">/</span><strong>{pageName}</strong></div>
          <div className="workspace-header-actions">{actions}<button type="button" onClick={onLogout} className="btn-swiss-secondary">Đăng xuất</button></div>
        </header>
        <main id="workspace-content" className="workspace-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
