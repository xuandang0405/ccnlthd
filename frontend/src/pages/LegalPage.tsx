import { Link, useParams } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";

const pages: Record<string, [string, string[]]> = {
  privacy: ["Chính sách quyền riêng tư", ["Tài liệu này là bản dự thảo và phải được chủ hệ thống cùng cố vấn pháp lý rà soát trước khi công bố.", "Nền tảng chỉ thu thập dữ liệu cần thiết để cung cấp dịch vụ, bảo mật tài khoản và xử lý yêu cầu của khách hàng.", "Doanh nghiệp chịu trách nhiệm thông báo cho khách truy cập về việc thu thập thông tin liên hệ và mục đích sử dụng."]],
  terms: ["Điều khoản sử dụng", ["Đây là nội dung dự thảo, chưa phải tư vấn pháp lý.", "Người dùng không được sử dụng nền tảng để xử lý dữ liệu trái pháp luật, phát tán nội dung độc hại hoặc cố tình gây quá tải hệ thống.", "Các giới hạn dịch vụ, giá và thời hạn subscription được xác định bởi cấu hình Backend hợp lệ."]],
  "data-policy": ["Chính sách xử lý dữ liệu", ["Dữ liệu tài liệu, hội thoại và lead được phân tách theo doanh nghiệp ở tầng Backend.", "Thời hạn lưu giữ và quy trình xóa dữ liệu phải được chủ hệ thống phê duyệt trước pilot.", "Dữ liệu có thể được gửi tới nhà cung cấp AI khi tính năng Gemini được bật; doanh nghiệp cần được thông báo rõ về bên xử lý thứ ba."]],
};

export function LegalPage() { const { slug = "privacy" } = useParams(); const [title, paragraphs] = pages[slug] ?? pages.privacy; return <><PublicNav/><main className="mx-auto min-h-[70vh] max-w-3xl px-5 py-20"><p className="font-bold text-blue-700">Pháp lý</p><h1 className="mt-3 text-4xl font-black text-slate-950">{title}</h1><div className="mt-8 space-y-5 leading-8 text-slate-600">{paragraphs.map((p) => <p key={p}>{p}</p>)}</div><Link to="/" className="mt-10 inline-block font-bold text-blue-700">← Quay lại trang chủ</Link></main></>; }
