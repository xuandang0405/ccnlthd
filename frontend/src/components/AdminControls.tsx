import { useState, type ReactNode } from "react";

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-800 border-slate-300",
    green: "bg-emerald-50 text-emerald-800 border-emerald-300",
    red: "bg-red-50 text-red-800 border-red-300",
    amber: "bg-amber-50 text-amber-900 border-amber-300",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };
  return (
    <span className={`font-sans text-xs px-2 py-0.5 font-semibold border ${colors[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-swiss-strong bg-white">
      <div className="border-b border-slate-200 px-5 py-3.5 bg-slate-50 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <p className="p-8 text-center text-slate-500 text-sm">{label}</p>;
}

export function CreditForm({
  onSubmit,
  pending,
  maximum = 1_000_000,
  label = "Áp dụng",
  placeholder = "Số lượt (+ cấp, − thu hồi)",
}: {
  onSubmit: (amount: number, reason: string) => Promise<unknown>;
  pending: boolean;
  maximum?: number;
  label?: string;
  placeholder?: string;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const value = Number(amount);
  const valid =
    Number.isInteger(value) && value !== 0 && Math.abs(value) <= maximum && reason.trim().length >= 3;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          onSubmit(value, reason.trim())
            .then(() => {
              setAmount("");
              setReason("");
            })
            .catch(() => {});
        }
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <input
        aria-label="Số lượng"
        type="number"
        min={-maximum}
        max={maximum}
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={placeholder}
        className="input-swiss text-sm w-48"
      />
      <input
        aria-label="Lý do"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="Nhập lý do điều chỉnh..."
        className="input-swiss text-sm flex-1 min-w-[200px]"
      />
      <button
        type="submit"
        disabled={!valid || pending}
        className="btn-swiss-primary text-sm py-1.5 px-4"
      >
        {label}
      </button>
    </form>
  );
}
