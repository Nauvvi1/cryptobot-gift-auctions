import { Request, Response, NextFunction } from "express";

/**
 * Demo auth:
 * - reads userId from `x-user-id` header or `?userId=...`
 * - attaches to req for convenience
 * This is intentionally minimal for contest demo UI.
 */
declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export function authMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header("x-user-id");
    const query = typeof req.query.userId === "string" ? req.query.userId : undefined;
    req.userId = header ?? query;
    next();
  };
}
