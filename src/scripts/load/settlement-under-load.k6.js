import http from "k6/http";
import { sleep } from "k6";
import { randomSeed, randomIntBetween } from "k6";

export const options = {
  scenarios: {
    pressure: {
      executor: "constant-arrival-rate",
      rate: 1200,
      timeUnit: "1s",
      duration: "45s",
      preAllocatedVUs: 600,
      maxVUs: 3000,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
    http_req_duration: ["p(95)<600", "p(99)<1500"],
  },
};

const BASE = __ENV.BASE || "http://localhost:8080";
const ROUND_ID = __ENV.ROUND_ID;
const AUCTION_ID = __ENV.AUCTION_ID;
const USERS = Number(__ENV.USERS || 1500);

randomSeed(202401);

function uid() {
  return `load_user_${randomIntBetween(1, USERS)}`;
}

export default function () {
  const userId = uid();

  if (ROUND_ID && Math.random() < 0.85) {
    const amountTotal = randomIntBetween(50, 12000);
    http.post(
      `${BASE}/api/rounds/${ROUND_ID}/bid`,
      JSON.stringify({ amountTotal }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
          "Idempotency-Key": `${userId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        },
        tags: { name: "bid" },
      }
    );
  } else if (AUCTION_ID) {
    http.get(`${BASE}/api/auctions/${AUCTION_ID}`, { headers: { "X-User-Id": userId }, tags: { name: "get_auction" } });
  } else {
    http.get(`${BASE}/api/auctions`, { headers: { "X-User-Id": userId }, tags: { name: "list_auctions" } });
  }

  sleep(0.005);
}
