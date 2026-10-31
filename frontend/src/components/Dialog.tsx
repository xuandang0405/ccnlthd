import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type DialogProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Dialog({ title, description, onClose, children, className = "max-w-3xl" }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    // Dialog gốc giữ focus bên trong và chặn tương tác với phần nền.
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`dialog-panel ${className}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <h3 id={titleId}>{title}</h3>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng cửa sổ"><X size={18} /></button>
      </header>
      {children}
    </dialog>
  );
}
