import { HttpError } from "./errors";

type Bucket = { resetAt: number; count: number };

export class MemoryRateLimiter {
  private map = new Map<string, Bucket>();

  hit(key: string, windowMs: number, max: number) {
    const t = Date.now();
    const b = this.map.get(key);
    if (!b || b.resetAt <= t) {
      this.map.set(key, { resetAt: t + windowMs, count: 1 });
      return;
    }
    if (b.count >= max) throw new HttpError(429, "RATE_LIMIT", "Too many requests");
    b.count++;
  }
}
