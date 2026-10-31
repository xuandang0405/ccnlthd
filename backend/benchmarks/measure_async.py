"""Khởi động app thử riêng, chạy k6, lưu số đo và luôn dừng đúng tiến trình đã tạo."""

import argparse
import ctypes
import json
import os
import platform
import socket
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import urlopen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--k6", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--port", default=18091, type=int)
    args = parser.parse_args()
    if not args.k6.is_file():
        raise SystemExit("Không tìm thấy k6; xem backend/benchmarks/README.md")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", args.port))
    args.output.mkdir(parents=True, exist_ok=True)
    backend = Path(__file__).resolve().parents[1]
    base_url = f"http://127.0.0.1:{args.port}"
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    with (args.output / "server.log").open("w", encoding="utf-8") as log:
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "benchmarks.async_demo:app", "--host", "127.0.0.1",
             "--port", str(args.port), "--workers", "1", "--no-access-log"],
            cwd=backend, stdout=log, stderr=log, creationflags=flags,
        )
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("App thử dừng khi khởi động; xem server.log")
                try:
                    with urlopen(f"{base_url}/health", timeout=1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("App thử chưa sẵn sàng")
            results = []
            for mode in ("blocking", "await", "thread"):
                summary_file = args.output / f"{mode}.json"
                result = subprocess.run(
                    [str(args.k6.resolve()), "run", "--summary-export", str(summary_file.resolve()),
                     "--env", f"BASE_URL={base_url}", "--env", f"MODE={mode}",
                     str(Path(__file__).with_name("async_load.js"))],
                    capture_output=True, text=True, encoding="utf-8", timeout=60,
                    creationflags=flags,
                )
                (args.output / f"{mode}.log").write_text(
                    result.stdout + result.stderr, encoding="utf-8"
                )
                result.check_returncode()
                metrics = json.loads(summary_file.read_text(encoding="utf-8"))["metrics"]
                results.append({
                    "mode": mode,
                    "requests": metrics["http_reqs"]["count"],
                    "requests_per_second": metrics["http_reqs"]["rate"],
                    "p95_ms": metrics["http_req_duration"]["p(95)"],
                    "mean_ms": metrics["http_req_duration"]["avg"],
                    "error_rate": metrics["http_req_failed"]["value"],
                })
            ram_kib = ctypes.c_ulonglong()
            ram_gib = None
            if os.name == "nt" and ctypes.windll.kernel32.GetPhysicallyInstalledSystemMemory(
                ctypes.byref(ram_kib)
            ):
                ram_gib = ram_kib.value / (1024 * 1024)
            evidence = {
                "measured_at_utc": datetime.now(UTC).isoformat(),
                "os": platform.platform(), "cpu": platform.processor(),
                "logical_cpu_count": os.cpu_count(), "installed_ram_gib": ram_gib,
                "python": platform.python_version(),
                "workers": 1, "virtual_users": 10, "iterations_per_case": 100,
                "simulated_wait_ms": 30, "database": "not used", "connection_pool": "not used",
                "results": results,
                "limitation": "One local run with simulated I/O, not production or Gemini load.",
            }
            (args.output / "summary.json").write_text(
                json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(json.dumps(evidence, ensure_ascii=False, indent=2))
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    main()
