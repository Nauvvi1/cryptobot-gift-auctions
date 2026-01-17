import http from "k6/http";
import { sleep } from "k6";
import { randomSeed, randomIntBetween } from "k6";

export const options = {
  scenarios: {
    mixed: {
      executor: "constant-arrival-rate",
      rate: 600,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 400,
      maxVUs: 2000,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<400", "p(99)<900"],
  },
};

const BASE = __ENV.BASE || "http://localhost:8080";
const ROUND_ID = __ENV.ROUND_ID;
const AUCTION_ID = __ENV.AUCTION_ID;
const USERS = Number(__ENV.USERS || 1000);

randomSeed(777);

function uid() {
  return `load_user_${randomIntBetween(1, USERS)}`;
}

export default function () {
  const userId = uid();

  const roll = Math.random();
  if (roll < 0.70) {
    http.get(`${BASE}/api/auctions`, { headers: { "X-User-Id": userId }, tags: { name: "list_auctions" } });
  } else if (roll < 0.90) {
    if (AUCTION_ID) {
      http.get(`${BASE}/api/auctions/${AUCTION_ID}`, { headers: { "X-User-Id": userId }, tags: { name: "get_auction" } });
    } else {
      http.get(`${BASE}/health`, { tags: { name: "health" } });
    }
  } else {
    if (ROUND_ID) {
      const amountTotal = randomIntBetween(50, 8000);
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
    } else {
      http.get(`${BASE}/health`, { tags: { name: "health" } });
    }
  }

  sleep(0.01);
}
