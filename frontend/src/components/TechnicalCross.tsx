import type { ReactNode } from "react";

type TechnicalCardProps = {
  children: ReactNode;
  className?: string;
  strong?: boolean;
};

export function TechnicalCard({ children, className = "", strong = false }: TechnicalCardProps) {
  return (
    <div
      className={`relative bg-white p-6 ${
        strong ? "border border-slate-300" : "border border-slate-200"
      } ${className}`}
    >
      {children}
    </div>
  );
}
