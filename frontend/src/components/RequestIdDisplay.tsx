import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

type RequestIdDisplayProps = {
  requestId?: string | null;
  compact?: boolean;
};

export function RequestIdDisplay({ requestId, compact = false }: RequestIdDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!requestId) return null;

  async function handleCopy() {
    if (!requestId) return;
    await navigator.clipboard.writeText(requestId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 font-sans text-xs bg-slate-100 border border-slate-300 px-2 py-1 text-slate-700">
        <span>REQ: {requestId}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-blue-600 transition-colors p-0.5"
          title="Sao chép Request ID"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
        </button>
      </div>
    );
  }

  return (
    <div className="card-swiss p-3 bg-slate-50 border-slate-300 my-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-slate-500" />
          <span className="font-sans text-sm font-bold text-slate-600 normal-case tracking-wider">
            Mã hỗ trợ
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="btn-swiss-secondary text-sm py-1 px-2.5 inline-flex items-center gap-1 font-sans"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
          <span>{copied ? "Đã chép" : "Sao chép mã"}</span>
        </button>
      </div>

      <div className="mt-2 font-sans text-sm text-slate-800 bg-white border border-slate-200 px-2.5 py-1.5 break-all select-all">
        {requestId}
      </div>

      <p className="mt-1.5 text-xs text-slate-500 font-sans">
        Gửi mã này kèm yêu cầu hỗ trợ để quản trị viên kiểm tra sự cố.
      </p>
    </div>
  );
}

export function RequestIdHelper() {
  const [inputVal, setInputVal] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyRequestId() {
    if (!inputVal.trim()) return;
    await navigator.clipboard.writeText(inputVal.trim());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card-swiss p-5 border-slate-200 bg-white">
      <div className="flex items-center gap-2 text-slate-900 mb-2">
        <Terminal size={18} className="text-blue-600" />
        <h3 className="font-bold text-base">Tra cứu mã hỗ trợ</h3>
      </div>
      <p className="text-sm text-slate-600 leading-5">
        Mỗi request qua hệ thống đều được FastAPI gán một <code>X-Request-ID</code> duy nhất. Tìm ID này trong log tại cửa sổ <code>run.bat</code> đang chạy trên máy chủ.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Nhập mã req-xxxxxxxx hoặc UUID..."
          className="input-swiss flex-1 min-w-[240px] font-sans text-sm"
        />
        <button
          type="button"
          disabled={!inputVal.trim()}
          onClick={copyRequestId}
          className="btn-swiss-secondary text-sm"
        >
          {copied ? "Đã sao chép" : "Sao chép mã"}
        </button>
      </div>

      {inputVal && (
        <div className="mt-3 bg-slate-950 p-3 font-sans text-sm text-slate-200">
          <p className="text-slate-400 text-xs mb-1"># Tìm chuỗi này trong log của cửa sổ run.bat:</p>
          <code>{inputVal.trim()}</code>
        </div>
      )}
    </div>
  );
}
