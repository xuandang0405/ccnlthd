import type { AdminWorkspace } from "../../hooks/useAdminWorkspace";
import { Badge, Panel, EmptyState, CreditForm } from "../../components/AdminControls";

export function AdminChatbots({ workspace }: { workspace: AdminWorkspace }) {
  const {
    section,
    chatbotSearch,
    setChatbotSearch,
    chatbots,
    toggleChatbot,
    editChatbot,
    chatbotCredits,
  } = workspace;
  return (<>
    {section === "chatbots" && (
      <Panel title="Chatbot của khách hàng">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-2">
          <input
            aria-label="Tìm chatbot"
            value={chatbotSearch}
            onChange={(e) => setChatbotSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc Public ID..."
            className="input-swiss text-sm font-sans max-w-md"
          />
        </div>

        {chatbots.data?.length === 0 && <EmptyState label="Không tìm thấy chatbot nào." />}
        <div className="divide-y divide-slate-200">
          {chatbots.data?.map((bot) => (
            <article key={bot.id} className="p-5 font-sans text-sm space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-slate-950 font-sans">{bot.name}</h4>
                    <Badge tone={bot.is_active ? "green" : "red"}>
                      {bot.is_active ? "Đang bật" : "Đã tắt"}
                    </Badge>
                  </div>
                  <p className="text-slate-600 text-sm mt-1">{bot.organization_name} · {bot.owner_emails.join(", ") || "Chưa có email quản lý"}</p>
                  <p className="text-slate-400 text-sm mt-1">Mã nhúng: {bot.public_id}</p>
                  <p className="text-slate-600 text-sm mt-2">Còn {bot.credit_balance.toLocaleString("vi-VN")} lượt · Đã dùng {bot.usage_count.toLocaleString("vi-VN")} lượt</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`${bot.is_active ? "Tắt" : "Bật"} chatbot ${bot.name}?`)) toggleChatbot.mutate(bot);
                  }}
                  className={`btn-swiss-secondary text-sm py-1 px-3 font-sans ${bot.is_active ? "text-red-700" : "text-emerald-700"
                    }`}
                >
                  {bot.is_active ? "Tắt chatbot" : "Bật chatbot"}
                </button>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <details className="border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">Chỉnh sửa nội dung và giao diện</summary>
                  <form
                    className="mt-4 grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      editChatbot.mutate({
                        id: bot.id,
                        name: String(form.get("name") || "").trim(),
                        description: String(form.get("description") || "").trim(),
                        greeting: String(form.get("greeting") || "").trim(),
                        tone: String(form.get("tone") || "professional"),
                        primary_color: String(form.get("primary_color") || "#2455c7"),
                      });
                    }}
                  >
                    <label className="text-sm">Tên chatbot<input name="name" defaultValue={bot.name} minLength={2} maxLength={120} required className="input-swiss mt-1" /></label>
                    <label className="text-sm">Mô tả<textarea name="description" defaultValue={bot.description || ""} maxLength={2000} rows={2} className="input-swiss mt-1" /></label>
                    <label className="text-sm">Lời chào<textarea name="greeting" defaultValue={bot.greeting} maxLength={500} required rows={2} className="input-swiss mt-1" /></label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">Giọng điệu
                        <select name="tone" defaultValue={bot.tone} className="input-swiss mt-1">
                          <option value="professional">Chuyên nghiệp</option>
                          <option value="friendly">Thân thiện</option>
                          <option value="concise">Ngắn gọn</option>
                        </select>
                      </label>
                      <label className="text-sm">Màu chủ đạo<input name="primary_color" type="color" defaultValue={bot.primary_color} className="input-swiss mt-1" /></label>
                    </div>
                    <button type="submit" disabled={editChatbot.isPending} className="btn-swiss-secondary justify-self-start">Lưu chatbot</button>
                  </form>
                </details>
                <details className="border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">Điều chỉnh lượt của chatbot</summary>
                  <p className="mt-3 text-sm text-slate-600">Số dương để cấp, số âm để thu hồi. Thay đổi này tác động trực tiếp đến chatbot.</p>
                  <CreditForm
                    onSubmit={(amount, reason) => chatbotCredits.mutateAsync({ id: bot.id, amount, reason })}
                    pending={chatbotCredits.isPending}
                    label="Điều chỉnh lượt"
                  />
                </details>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    )}
  </>);
}
