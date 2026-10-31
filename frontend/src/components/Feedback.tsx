import type { ReactNode } from "react";

export function LoadingState({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return <div className="loading-state" role="status"><div className="loading-lines" aria-hidden="true"><span /><span /><span /></div><p>{label}</p></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="feedback feedback-error" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="btn-swiss-secondary">Thử lại</button>}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
