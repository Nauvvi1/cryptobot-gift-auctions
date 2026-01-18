import { Router } from "express";
import type { MongoCtx } from "../../../../app/mongo";
import { HttpError } from "../../../../common/errors";
import { parseOrThrow } from "../../../../common/validate";
import { MemoryRateLimiter } from "../../../../common/rateLimit";
import { config } from "../../../../app/config";
import { sseHub } from "../../realtime/sseHub";
import { asyncHandler } from "../../../../common/asyncHandler";

import { CreateAuctionDto, SeedItemsDto, StartAuctionDto, PlaceBidDto, DepositDto } from "./dto";

import {
  createAuction,
  seedItems,
  startAuction,
  cancelAuction,
  deposit,
} from "../../application/adminService";
import { placeOrIncreaseBid } from "../../application/bidService";
import {
  listAuctions,
  getAuction,
  getRoundTop,
  getMyWallet,
  getMyBids,
  getMyAwards,
} from "../../application/queries";
import { listEvents } from "../../application/eventsService";

const rl = new MemoryRateLimiter();
const globalRl = new MemoryRateLimiter();

function markRoute(path: string) {
  return (req: any, res: any, next: any) => {
    res.locals.routePath = path;
    next();
  };
}

export function routes(mongo: MongoCtx) {
  const r = Router();

  // SSE
  r.get(
    "/sse",
    markRoute("/sse"),
    asyncHandler(async (req, res) => {
      const auctionId = typeof req.query.auctionId === "string" ? req.query.auctionId : undefined;
      const roundId = typeof req.query.roundId === "string" ? req.query.roundId : undefined;
      const userId =
        typeof req.query.userId === "string" ? req.query.userId : (req as any).userId;
      const afterSeq = Number(req.query.afterSeq ?? 0) || 0;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      sseHub.add(res, { auctionId, roundId, userId, afterSeq });

      const t = setInterval(() => res.write(": keepalive\n\n"), 15000);
      res.on("close", () => clearInterval(t));
    })
  );

  // Public API
  r.get(
    "/api/auctions",
    markRoute("/api/auctions"),
    asyncHandler(async (_req, res) => {
      res.json(await listAuctions(mongo));
    })
  );

  r.get(
    "/api/auctions/:id",
    markRoute("/api/auctions/:id"),
    asyncHandler(async (req, res) => {
      res.json(await getAuction(mongo, req.params.id));
    })
  );

  r.get(
    "/api/rounds/:id/top",
    markRoute("/api/rounds/:id/top"),
    asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit ?? 100);
      res.json(await getRoundTop(mongo, req.params.id, limit));
    })
  );

  r.post(
    "/api/rounds/:id/bid",
    markRoute("/api/rounds/:id/bid"),
    asyncHandler(async (req, res) => {
      const userId = (req as any).userId!;
      const idem = req.header("Idempotency-Key");
      if (!idem) throw new HttpError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key required");

      rl.hit(`bid:user:${userId}`, config.BID_RL_WINDOW_MS, config.BID_RL_MAX);
      globalRl.hit(`bid:global`, config.GLOBAL_BID_RL_WINDOW_MS, config.GLOBAL_BID_RL_MAX);

      const input = parseOrThrow(PlaceBidDto, req.body);
      const out = await placeOrIncreaseBid(mongo, {
        roundId: req.params.id,
        userId,
        idempotencyKey: idem,
        input,
      });
      res.json(out);
    })
  );

  r.get(
    "/api/me/wallet",
    markRoute("/api/me/wallet"),
    asyncHandler(async (req, res) => {
      res.json(await getMyWallet(mongo, (req as any).userId!));
    })
  );

  r.get(
    "/api/me/bids",
    markRoute("/api/me/bids"),
    asyncHandler(async (req, res) => {
      res.json(await getMyBids(mongo, (req as any).userId!));
    })
  );

  r.get(
    "/api/me/awards",
    markRoute("/api/me/awards"),
    asyncHandler(async (req, res) => {
      res.json(await getMyAwards(mongo, (req as any).userId!));
    })
  );

  // Events replay
  r.get(
    "/api/events",
    markRoute("/api/events"),
    asyncHandler(async (req, res) => {
      const afterSeq = req.query.afterSeq != null ? Number(req.query.afterSeq) : undefined;
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const auctionId = typeof req.query.auctionId === "string" ? req.query.auctionId : undefined;
      const roundId = typeof req.query.roundId === "string" ? req.query.roundId : undefined;

      res.json(await listEvents(mongo, { afterSeq, limit, auctionId, roundId }));
    })
  );

  // Admin API
  r.post(
    "/admin/auctions",
    markRoute("/admin/auctions"),
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(CreateAuctionDto, req.body);
      res.json(await createAuction(mongo, input));
    })
  );

  r.post(
    "/admin/auctions/:id/items/seed",
    markRoute("/admin/auctions/:id/items/seed"),
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(SeedItemsDto, req.body);
      res.json(await seedItems(mongo, req.params.id, input));
    })
  );

  r.post(
    "/admin/auctions/:id/start",
    markRoute("/admin/auctions/:id/start"),
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(StartAuctionDto, req.body);
      res.json(await startAuction(mongo, req.params.id, input));
    })
  );

  r.post(
    "/admin/auctions/:id/cancel",
    markRoute("/admin/auctions/:id/cancel"),
    asyncHandler(async (req, res) => {
      res.json(await cancelAuction(mongo, req.params.id));
    })
  );

  r.post(
    "/admin/users/:userId/deposit",
    markRoute("/admin/users/:userId/deposit"),
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(DepositDto, req.body);
      res.json(await deposit(mongo, req.params.userId, input.amount));
    })
  );

  return r;
}
