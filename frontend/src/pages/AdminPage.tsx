import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Users } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../services/api";
import type { AdminOrganization, AdminSummary } from "../types";

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["admin-summary"], queryFn: () => api<AdminSummary>("/admin/summary"), enabled: !!user?.is_super_admin });
  const organizations = useQuery({ queryKey: ["admin-organizations"], queryFn: () => api<AdminOrganization[]>("/admin/organizations"), enabled: !!user?.is_super_admin });
  const toggle = useMutation({ mutationFn: (item: AdminOrganization) => api<AdminOrganization>(`/admin/organizations/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-organizations"] }) });
  if (!user) return <Navigate to="/login" replace/>;
  if (!user.is_super_admin) return <Navigate to="/app" replace/>;
  return <main className="min-h-screen bg-slate-50 p-5 lg:p-10"><div className="mx-auto max-w-6xl"><Link to="/app" className="inline-flex items-center gap-2 font-semibold text-blue-700"><ArrowLeft size={18}/>Dashboard doanh nghiệp</Link><h1 className="mt-6 text-4xl font-black">Quản trị hệ thống</h1><p className="mt-2 text-slate-600">Chỉ số toàn nền tảng và trạng thái doanh nghiệp.</p>{summary.isError && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{summary.error.message}</p>}{summary.data && <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-2xl border bg-white p-5"><Building2 className="text-blue-700"/><p className="mt-5 text-3xl font-black">{summary.data.organizations}</p><p className="text-sm text-slate-500">Doanh nghiệp</p></article><article className="rounded-2xl border bg-white p-5"><Users className="text-blue-700"/><p className="mt-5 text-3xl font-black">{summary.data.users}</p><p className="text-sm text-slate-500">Người dùng</p></article><article className="rounded-2xl border bg-white p-5"><p className="text-3xl font-black">{summary.data.conversations}</p><p className="text-sm text-slate-500">Cuộc trò chuyện</p></article><article className="rounded-2xl border bg-white p-5"><p className="text-3xl font-black">{summary.data.payments_pending}</p><p className="text-sm text-slate-500">Thanh toán chờ xử lý</p></article></section>}<section className="mt-8 overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="text-xl font-black">Doanh nghiệp</h2></div>{organizations.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0"><div><p className="font-bold">{item.name}</p><p className="text-sm text-slate-500">{item.slug}</p></div><button onClick={() => toggle.mutate(item)} disabled={toggle.isPending} className={`rounded-xl px-4 py-2 text-sm font-bold ${item.is_active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.is_active ? "Vô hiệu hóa" : "Kích hoạt"}</button></div>)}</section></div></main>;
}
