import type { AdminWorkspace } from "../../hooks/useAdminWorkspace";
import { Badge, Panel, EmptyState, CreditForm } from "../../components/AdminControls";

export function AdminAccounts({ workspace }: { workspace: AdminWorkspace }) {
  const {
    user,
    section,
    userSearch,
    setUserSearch,
    organizations,
    users,
    toggleOrganization,
    toggleUser,
    toggleAdmin,
    editUser,
    userCredits,
    userSlots,
    resetPassword,
  } = workspace;
  if (!user) return null;
  return (<>
    {section === "organizations" && (
      <Panel title="Doanh nghiệp trên nền tảng">
        {organizations.data?.length === 0 && <EmptyState label="Chưa có doanh nghiệp nào." />}
        <div className="divide-y divide-slate-100 font-sans text-sm">
          {organizations.data?.map((org) => (
            <div key={org.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
              <div>
                <b className="text-sm font-sans text-slate-950 block">{org.name}</b>
                <span className="text-slate-500 text-xs">
                  Đường dẫn: {org.slug} · Tạo ngày {new Date(org.created_at).toLocaleDateString("vi-VN")}
                </span>
              </div>
              <button
                type="button"
                disabled={toggleOrganization.isPending}
                onClick={() => {
                  if (window.confirm(`${org.is_active ? "Tạm ngưng" : "Kích hoạt"} doanh nghiệp ${org.name}?`)) toggleOrganization.mutate(org);
                }}
                className={`btn-swiss-secondary text-sm py-1.5 px-3 font-sans ${org.is_active ? "text-red-700" : "text-emerald-700"
                  }`}
              >
                {org.is_active ? "Tạm ngưng" : "Kích hoạt"}
              </button>
            </div>
          ))}
        </div>
      </Panel>
    )}
    {section === "users" && (
      <Panel title="Tài khoản người dùng">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-2">
          <input
            aria-label="Tìm kiếm người dùng"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Tìm theo email hoặc họ tên..."
            className="input-swiss text-sm font-sans max-w-md"
          />
        </div>

        {users.data?.length === 0 && <EmptyState label="Không tìm thấy tài khoản người dùng." />}
        <div className="divide-y divide-slate-200">
          {users.data?.map((u) => (
            <article key={u.id} className="p-5 font-sans text-sm space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-slate-950 font-sans">{u.full_name}</h4>
                    {u.is_super_admin && <Badge tone="blue">Quản trị viên</Badge>}
                    {!u.is_active && <Badge tone="red">Đã khóa</Badge>}
                  </div>
                  <p className="text-slate-600 text-sm mt-1">{u.email}</p>
                  <p className="text-slate-400 text-sm mt-1">Mã tài khoản: {u.id}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={u.id === user.id}
                    onClick={() => {
                      if (window.confirm(`${u.is_super_admin ? "Thu hồi" : "Cấp"} quyền Admin cho ${u.email}?`)) {
                        toggleAdmin.mutate(u);
                      }
                    }}
                    className="btn-swiss-secondary text-sm py-1 px-2.5 font-sans"
                  >
                    {u.is_super_admin ? "Thu hồi quyền admin" : "Cấp quyền admin"}
                  </button>

                  <button
                    type="button"
                    disabled={u.id === user.id}
                    onClick={() => {
                      if (window.confirm(`Đặt lại mật khẩu cho ${u.email}?`)) {
                        resetPassword.mutateAsync(u.id).then((res) => {
                          window.alert(`Mật khẩu tạm thời cho ${u.email}: \n\n${res.temporary_password}\n\nHãy gửi riêng cho người dùng.`);
                        }).catch(() => { });
                      }
                    }}
                    className="btn-swiss-secondary text-sm py-1 px-2.5 font-sans text-amber-800"
                  >
                    Đặt lại mật khẩu
                  </button>

                  <button
                    type="button"
                    disabled={u.id === user.id}
                    onClick={() => {
                      if (window.confirm(`${u.is_active ? "Khóa" : "Mở khóa"} tài khoản ${u.email}?`)) toggleUser.mutate(u);
                    }}
                    className={`btn-swiss-secondary text-sm py-1 px-2.5 font-sans ${u.is_active ? "text-red-700" : "text-emerald-700"
                      }`}
                  >
                    {u.is_active ? "Khóa tài khoản" : "Mở khóa"}
                  </button>
                </div>
              </div>

              <details className="border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Chỉnh sửa tên và email</summary>
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    editUser.mutate({
                      id: u.id,
                      full_name: String(form.get("full_name") || "").trim(),
                      email: String(form.get("email") || "").trim(),
                    });
                  }}
                >
                  <label className="text-sm text-slate-700">Họ tên
                    <input name="full_name" defaultValue={u.full_name} minLength={2} maxLength={200} required className="input-swiss mt-1" />
                  </label>
                  <label className="text-sm text-slate-700">Email
                    <input name="email" type="email" defaultValue={u.email} required className="input-swiss mt-1" />
                  </label>
                  <button type="submit" disabled={editUser.isPending} className="btn-swiss-secondary sm:col-span-2 sm:justify-self-start">Lưu thông tin</button>
                </form>
              </details>

              {u.organization_accounts.map((acc) => (
                <details key={acc.id} className="border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    {acc.name} · Ví chung: {acc.purchased_remaining.toLocaleString("vi-VN")} lượt · Chatbot: {acc.chatbot_count}/{acc.chatbot_slots}
                  </summary>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-sm">Cấp hoặc thu hồi lượt trong ví chung</p>
                      <p className="mt-1 text-sm text-slate-600">Nhập số dương để cấp, số âm để thu hồi. Cần ghi lý do.</p>
                      <CreditForm
                        onSubmit={(amount, reason) => userCredits.mutateAsync({ userId: u.id, organizationId: acc.id, amount, reason })}
                        pending={userCredits.isPending}
                        label="Điều chỉnh lượt"
                      />
                    </div>
                    <div className="border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-sm">Vị trí chatbot</p>
                      <p className="mt-1 text-sm text-slate-600">Tăng hoặc giảm số chatbot doanh nghiệp được tạo. Không thể giảm dưới số đang dùng.</p>
                      <CreditForm
                        onSubmit={(amount, reason) => userSlots.mutateAsync({ userId: u.id, organizationId: acc.id, amount, reason })}
                        pending={userSlots.isPending}
                        maximum={100}
                        label="Điều chỉnh vị trí"
                        placeholder="Số vị trí (+ tăng, − giảm)"
                      />
                    </div>
                  </div>
                </details>
              ))}
            </article>
          ))}
        </div>
      </Panel>
    )}
  </>);
}
