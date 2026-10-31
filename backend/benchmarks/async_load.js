import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  iterations: 100,
  thresholds: { http_req_failed: ["rate==0"] },
};

export default function () {
  const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:18091";
  const mode = __ENV.MODE || "await";
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl)) {
    throw new Error("Bài thử chỉ được chạy trên localhost, không chạy vào server thật.");
  }
  if (!["blocking", "await", "thread"].includes(mode)) {
    throw new Error("MODE phải là blocking, await hoặc thread.");
  }
  const response = http.get(`${baseUrl}/${mode}`, { timeout: "5s" });
  check(response, { "status 200": (result) => result.status === 200 });
}
