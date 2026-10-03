import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../services/api";

type HealthResponse = {
  status: "ready" | "not_ready" | "ok";
  components?: {
    database?: string;
    redis?: string;
  };
};

export function TopStatusBar() {
  const [lastCheckTime, setLastCheckTime] = useState<string>("");

  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: () => api<HealthResponse>("/health"),
    refetchInterval: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (health.dataUpdatedAt) {
      const d = new Date(health.dataUpdatedAt);
      setLastCheckTime(d.toLocaleTimeString("vi-VN", { hour12: false }));
    }
  }, [health.dataUpdatedAt]);

  const isHealthy = health.data?.status === "ready" || health.data?.status === "ok";
  const dbStatus = health.data?.components?.database === "up" ? "Sẵn sàng" : health.isPending ? "Đang kiểm tra" : "Chưa sẵn sàng";
  const limitStatus = health.isPending ? "Đang kiểm tra" : !health.data || health.data.components?.redis === "down" ? "Chưa sẵn sàng" : "Sẵn sàng";

  return (
    <div className="top-status-bar px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm select-none">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <span className="flex items-center gap-2 font-semibold text-white">
          <span className={`inline-block w-2 h-2 ${isHealthy ? "bg-emerald-400" : health.isPending ? "bg-slate-400" : "bg-red-400"}`} />
          {isHealthy ? "Hệ thống đang hoạt động" : health.isPending ? "Đang kiểm tra hệ thống" : "Hệ thống cần kiểm tra"}
        </span>
        <span className="text-slate-300 hidden sm:inline">Cơ sở dữ liệu: <span className="text-white">{dbStatus}</span></span>
        <span className="text-slate-300 hidden md:inline">Giới hạn yêu cầu: <span className="text-white">{limitStatus}</span></span>
      </div>

      <div className="flex items-center gap-3 text-slate-400">
        {lastCheckTime && <span className="hidden sm:inline">Kiểm tra lúc {lastCheckTime}</span>}
        <button
          type="button"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
          title="Kiểm tra lại sức khỏe hệ thống"
          aria-label="Kiểm tra lại sức khỏe hệ thống"
          className="hover:text-white transition-colors p-1 text-sm underline underline-offset-4"
        >
          Kiểm tra lại
        </button>
      </div>
    </div>
  );
}
