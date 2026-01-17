import http from "k6/http";
import { sleep } from "k6";

export const options = {
  vus: 200,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200", "p(99)<400"],
  },
};

const BASE = __ENV.BASE || "http://localhost:8080";

export default function () {
  http.get(`${BASE}/api/auctions`);
  sleep(0.05);
}
