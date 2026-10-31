import { useState } from "react";

export function ChatbotCreditControls({
  balance,
  wallet,
  pending,
  onAllocate,
}: {
  balance: number;
  wallet: number;
  pending: boolean;
  onAllocate: (amount: number) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const count = Number(amount);
  const valid = Number.isInteger(count) && count > 0 && count <= 1_000_000;

  function submit(value: number) {
    onAllocate(value)
      .then(() => setAmount(""))
      .catch(() => {});
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input
        aria-label="Số lượt chuyển"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Nhập số lượt..."
        className="input-swiss text-sm font-sans flex-1 min-w-[120px]"
      />
      <button
        type="button"
        disabled={!valid || count > wallet || pending}
        onClick={() => submit(count)}
        className="btn-swiss-primary text-sm py-1.5 px-3 font-sans"
      >
        Cấp lượt
      </button>
      <button
        type="button"
        disabled={!valid || count > balance || pending}
        onClick={() => submit(-count)}
        className="btn-swiss-secondary text-sm py-1.5 px-3 font-sans text-amber-800"
      >
        Thu hồi về ví
      </button>
    </div>
  );
}

export function PageControls({ page, pageSize, total, onPageChange }: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>Trang {page} / {pageCount} · {total.toLocaleString("vi-VN")} mục</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="btn-swiss-secondary px-3 py-1.5 text-sm">Trang trước</button>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="btn-swiss-secondary px-3 py-1.5 text-sm">Trang sau</button>
      </div>
    </nav>
  );
}
