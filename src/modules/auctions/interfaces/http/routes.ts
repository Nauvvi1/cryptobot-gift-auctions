import { Router } from "express";
import type { MongoCtx } from "../../../../app/mongo";
import { asHttpError, HttpError } from "../../../../common/errors";
import { parseOrThrow } from "../../../../common/validate";
import { MemoryRateLimiter } from "../../../../common/rateLimit";
import { config } from "../../../../app/config";
import { sseHub } from "../../realtime/sseHub";

import { CreateAuctionDto, SeedItemsDto, StartAuctionDto, PlaceBidDto, DepositDto } from "./dto";

import { createAuction, seedItems, startAuction, cancelAuction, deposit } from "../../application/adminService";
import { placeOrIncreaseBid } from "../../application/bidService";
import { listAuctions, getAuction, getRoundTop, getMyWallet, getMyBids, getMyAwards } from "../../application/queries";
import { listEvents } from "../../application/eventsService";

const rl = new MemoryRateLimiter();
const globalRl = new MemoryRateLimiter();

export function routes(mongo: MongoCtx) {
  const r = Router();

  // SSE
  r.get("/sse", async (req, res) => {
    const auctionId = typeof req.query.auctionId === "string" ? req.query.auctionId : undefined;
    const roundId = typeof req.query.roundId === "string" ? req.query.roundId : undefined;
    const userId = typeof req.query.userId === "string" ? req.query.userId : (req as any).userId;
    const afterSeq = Number(req.query.afterSeq ?? 0) || 0;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    sseHub.add(res, { auctionId, roundId, userId, afterSeq });

    // keepalive
    const t = setInterval(() => res.write(": keepalive\n\n"), 15000);
    res.on("close", () => clearInterval(t));
  });

  // Public API
  r.get("/api/auctions", async (_req, res) => {
    try {
      res.json(await listAuctions(mongo));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.get("/api/auctions/:id", async (req, res) => {
    try {
      res.json(await getAuction(mongo, req.params.id));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.get("/api/rounds/:id/top", async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 100);
      res.json(await getRoundTop(mongo, req.params.id, limit));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.post("/api/rounds/:id/bid", async (req, res) => {
    try {
      const userId = (req as any).userId!;
      const idem = req.header("Idempotency-Key");
      if (!idem) throw new HttpError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key required");

      // rate limits
      rl.hit(`bid:user:${userId}`, config.BID_RL_WINDOW_MS, config.BID_RL_MAX);
      globalRl.hit(`bid:global`, config.GLOBAL_BID_RL_WINDOW_MS, config.GLOBAL_BID_RL_MAX);

      const input = parseOrThrow(PlaceBidDto, req.body);
      const out = await placeOrIncreaseBid(mongo, { roundId: req.params.id, userId, idempotencyKey: idem, input });
      res.json(out);
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.get("/api/me/wallet", async (req, res) => {
    try {
      res.json(await getMyWallet(mongo, (req as any).userId!));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.get("/api/me/bids", async (req, res) => {
    try {
      res.json(await getMyBids(mongo, (req as any).userId!));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.get("/api/me/awards", async (req, res) => {
    try {
      res.json(await getMyAwards(mongo, (req as any).userId!));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  // Events replay (ordering by seq)
  r.get("/api/events", async (req, res) => {
    try {
      const afterSeq = req.query.afterSeq != null ? Number(req.query.afterSeq) : undefined;
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const auctionId = typeof req.query.auctionId === "string" ? req.query.auctionId : undefined;
      const roundId = typeof req.query.roundId === "string" ? req.query.roundId : undefined;
      res.json(await listEvents(mongo, { afterSeq, limit, auctionId, roundId }));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  // Admin API
  r.post("/admin/auctions", async (req, res) => {
    try {
      const input = parseOrThrow(CreateAuctionDto, req.body);
      res.json(await createAuction(mongo, input));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.post("/admin/auctions/:id/items/seed", async (req, res) => {
    try {
      const input = parseOrThrow(SeedItemsDto, req.body);
      res.json(await seedItems(mongo, req.params.id, input));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.post("/admin/auctions/:id/start", async (req, res) => {
    try {
      const input = parseOrThrow(StartAuctionDto, req.body);
      res.json(await startAuction(mongo, req.params.id, input));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.post("/admin/auctions/:id/cancel", async (req, res) => {
    try {
      res.json(await cancelAuction(mongo, req.params.id));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  r.post("/admin/users/:userId/deposit", async (req, res) => {
    try {
      const input = parseOrThrow(DepositDto, req.body);
      res.json(await deposit(mongo, req.params.userId, input.amount));
    } catch (e) {
      const he = asHttpError(e);
      res.status(he.status).json({ code: he.code, message: he.message, details: he.details });
    }
  });

  return r;
}
