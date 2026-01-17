import express from "express";
import path from "path";
import type { MongoCtx } from "./mongo";
import { authMiddleware } from "../modules/auth/authMiddleware";
import { routes } from "../modules/auctions/interfaces/http/routes";
import { registry, httpLatency } from "./metrics";

export async function createApp(mongo: MongoCtx) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const dur = Date.now() - start;
      const route = (req.route && (req.route as any).path) ? String((req.route as any).path) : req.path;
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

  app.use(routes(mongo));

  return app;
}
