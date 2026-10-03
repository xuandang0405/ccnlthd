import { useState } from "react";
import { Link } from "react-router-dom";

export function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#dce2e9] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Mạch AI - Trang chủ">
          <span className="flex h-9 w-9 items-center justify-center bg-[#2455c7] text-sm font-extrabold text-white">M</span>
          <span className="text-lg font-bold tracking-tight text-[#17233a]">Mạch <span className="text-[#2455c7]">AI</span></span>
        </Link>

        <button type="button" className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 md:hidden" aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen(!open)}>
          {open ? "Đóng" : "Menu"}
        </button>

        <nav id="public-navigation" aria-label="Điều hướng chính" className={`${open ? "flex" : "hidden"} absolute left-0 top-full w-full flex-col gap-4 border-b border-slate-200 bg-white p-5 md:static md:flex md:w-auto md:flex-row md:items-center md:gap-8 md:border-0 md:bg-transparent md:p-0`}>
          <a href="/#features" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-600 hover:text-[#2455c7]">Tính năng</a>
          <a href="/#how-it-works" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-600 hover:text-[#2455c7]">Cách hoạt động</a>
          <a href="/#pricing" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-600 hover:text-[#2455c7]">Chi phí</a>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 md:border-0 md:pt-0">
            <Link to="/login" className="text-sm font-semibold text-slate-800 hover:text-[#2455c7]">Đăng nhập</Link>
            <Link to="/register" className="btn-swiss-primary px-4 py-2 text-sm">Bắt đầu miễn phí</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
