import { Request, Response, NextFunction } from "express";

// very light in-memory rate limiting for demo (not production)
const buckets = new Map<string, { n: number; ts: number }>();

export function rateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const b = buckets.get(key) ?? { n: 0, ts: now };
    if (now - b.ts > 1000) { b.n = 0; b.ts = now; }
    b.n += 1;
    buckets.set(key, b);
    if (b.n > 200) return res.status(429).json({ error: { code: "RATE_LIMIT", message: "Too many requests" } });
    next();
  };
}
