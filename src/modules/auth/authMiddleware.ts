import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header("X-User-Id") || "demo_user_1";
    req.userId = userId;
    next();
  };
}
