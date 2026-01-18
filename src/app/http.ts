import express from "express";
import path from "path";
import crypto from "crypto";
import type { MongoCtx } from "./mongo";
import { authMiddleware } from "../modules/auth/authMiddleware";
import { routes } from "../modules/auctions/interfaces/http/routes";
import { registry, httpLatency } from "./metrics";
import { asHttpError } from "../common/errors";

function getReqId(req: any) {
  const header = req.header?.("X-Request-Id");
  if (typeof header === "string" && header.trim()) return header.trim();
  return crypto.randomUUID();
}

// avoid logging massive bodies
function safeBody(body: any) {
  if (body == null) return body;
  try {
    const s = JSON.stringify(body);
    if (s.length <= 2000) return body;
    return { _truncated: true, length: s.length };
  } catch {
    return { _unserializable: true };
  }
}

export async function createApp(mongo: MongoCtx) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  // request id
  app.use((req: any, res: any, next) => {
    const rid = getReqId(req);
    req.requestId = rid;
    res.setHeader("X-Request-Id", rid);
    next();
  });

  // metrics
  app.use((req: any, res: any, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const dur = Date.now() - start;

      // Best-effort route label:
      // If router set res.locals.routePath, use it; else fallback to req.path
      const route = res.locals?.routePath ? String(res.locals.routePath) : req.path;

      httpLatency.labels(req.method, route, String(res.statusCode)).observe(dur);
    });
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  app.use(express.static(path.join(process.cwd(), "public")));

  app.use(authMiddleware());

  // API routes
  app.use(routes(mongo));

  // 404
  app.use((req: any, res: any) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global error handler (MUST be last)
  app.use((err: any, req: any, res: any, _next: any) => {
    const he = asHttpError(err);

    // Centralized logging
    console.error("[HTTP ERROR]", {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      userId: req.userId,
      params: req.params,
      query: req.query,
      body: safeBody(req.body),
      status: he.status,
      code: he.code,
      message: he.message,
      details: he.details,
      stack: err?.stack,
    });

    res.status(he.status).json({
      code: he.code,
      message: he.message,
      details: he.details,
      requestId: req.requestId,
    });
  });

  return app;
}
