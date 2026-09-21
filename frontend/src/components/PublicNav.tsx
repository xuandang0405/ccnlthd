import { Bot, Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="glass sticky top-0 z-40 border-b border-slate-200/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-950">
          <span className="rounded-xl bg-blue-600 p-2 text-white"><Bot size={20} /></span>
          AI Sales Assistant
        </Link>
        <button className="rounded-lg p-2 md:hidden" aria-label="Mở menu" onClick={() => setOpen(!open)}><Menu /></button>
        <nav className={`${open ? "flex" : "hidden"} absolute left-0 top-17 w-full flex-col gap-4 border-b bg-white p-5 md:static md:flex md:w-auto md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0`}>
          <a href="/#features" className="text-sm font-medium text-slate-600 hover:text-blue-700">Tính năng</a>
          <a href="/#how-it-works" className="text-sm font-medium text-slate-600 hover:text-blue-700">Cách hoạt động</a>
          <a href="/#pricing" className="text-sm font-medium text-slate-600 hover:text-blue-700">Bảng giá</a>
          <a href="/#faq" className="text-sm font-medium text-slate-600 hover:text-blue-700">FAQ</a>
          <Link to="/login" className="text-sm font-semibold text-slate-700">Đăng nhập</Link>
          <Link to="/register" className="rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700">Bắt đầu miễn phí</Link>
        </nav>
      </div>
    </header>
  );
}
