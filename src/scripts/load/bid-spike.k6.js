import http from "k6/http";
import { sleep } from "k6";
import { randomSeed, randomIntBetween } from "k6";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 500,
      maxVUs: 3000,
      stages: [
        { target: 50, duration: "10s" },
        { target: 2000, duration: "10s" },
        { target: 2000, duration: "10s" },
        { target: 100, duration: "10s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<500", "p(99)<1200"],
  },
};

const BASE = __ENV.BASE || "http://localhost:8080";
const ROUND_ID = __ENV.ROUND_ID;
const USERS = Number(__ENV.USERS || 500);

randomSeed(12345);

function userId() {
  return `load_user_${randomIntBetween(1, USERS)}`;
}

export default function () {
  if (!ROUND_ID) {
    http.get(`${BASE}/health`);
    sleep(0.2);
    return;
  }

  const uid = userId();
  const amountTotal = randomIntBetween(50, 5000);

  http.post(
    `${BASE}/api/rounds/${ROUND_ID}/bid`,
    JSON.stringify({ amountTotal }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": uid,
        "Idempotency-Key": `${uid}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      },
      tags: { name: "bid" },
    }
  );

  sleep(0.01);

  if (Math.random() < 0.1) http.get(`${BASE}/api/auctions`, { headers: { "X-User-Id": uid } });
}
