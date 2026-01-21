import express from "express";
import cors from "cors";
import path from "path";
import { asyncHandler } from "../common/asyncHandler";
import { rateLimit } from "../common/rateLimit";
import { authMiddleware } from "../modules/auth/authMiddleware";
import { registerAuctionRoutes } from "../modules/auctions/interfaces/http/routes";
import { registerUserRoutes } from "../modules/users/interfaces/http/routes";
import { AppError } from "../common/errors";

export function createHttpServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit());

  // naive auth for demo: userId header/query
  app.use(authMiddleware());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  registerUserRoutes(app);
  registerAuctionRoutes(app);

  // static UI
  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    }),
  );

  // Global error handler: always returns structured JSON
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    const isApp = err instanceof AppError;
    const status = Number(err?.statusCode ?? (isApp ? err.statusCode : 500));
    const code = String(err?.code ?? (isApp ? err.code : "INTERNAL"));
    const message = String(err?.message ?? "Internal error");
    const details = err?.details ?? undefined;

    res.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    });
  });

  return app;
}
