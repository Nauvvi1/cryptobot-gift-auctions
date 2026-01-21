import { Express } from "express";
import { asyncHandler } from "../../../../common/asyncHandler";
import { asNumber, asString } from "../../../../common/validate";
import { assert } from "../../../../common/errors";
import { createAuction, startAuction } from "../../application/adminService";
import { placeBid } from "../../application/bidService";
import { getAuction, getCurrentRound, getTopEntriesForAuction, getWinnersByRound } from "../../application/queries";
import { sseAddClient } from "../../realtime/sseHub";
import { startDemoBots } from "../../application/demoBots";

function isHex24(s: string) {
  return /^[a-f0-9]{24}$/i.test(s);
}

function requireHex24(value: string, code: string, message: string) {
  assert(isHex24(value), code, message, 400);
  return value;
}

export function registerAuctionRoutes(app: Express) {
  app.post(
    "/api/auctions",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const auction = await createAuction({
        title: asString(body.title, "title", 80),
        totalItems: asNumber(body.totalItems, "totalItems"),
        awardPerRound: asNumber(body.awardPerRound, "awardPerRound"),
        roundDurationSec: asNumber(body.roundDurationSec, "roundDurationSec"),
        antiSniping: {
          thresholdSec: asNumber(body.antiSniping?.thresholdSec, "antiSniping.thresholdSec"),
          extendSec: asNumber(body.antiSniping?.extendSec, "antiSniping.extendSec"),
          maxExtensions: asNumber(body.antiSniping?.maxExtensions, "antiSniping.maxExtensions"),
        },
      });
      res.json({ auction });
    }),
  );

  app.post(
    "/api/auctions/:id/start",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const round = await startAuction(id);
      res.json({ round });
    }),
  );

  app.get(
    "/api/auctions/:id",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const auction = await getAuction(id);
      res.json({ auction });
    }),
  );

  app.get(
    "/api/auctions/:id/round",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const round = await getCurrentRound(id);
      res.json({ round });
    }),
  );

  app.get(
    "/api/auctions/:id/top",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const limit = req.query.limit ? asNumber(req.query.limit, "limit") : 20;
      const top = await getTopEntriesForAuction(id, limit);
      res.json({ top });
    }),
  );

  app.post(
    "/api/auctions/:id/bid",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const body = req.body ?? {};
      const userId = requireHex24(asString(body.userId, "userId", 40), "INVALID_USER_ID", "Некорректный User ID");
      const amount = asNumber(body.amount, "amount");
      await placeBid({ auctionId: id, userId, amount });
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/auctions/:id/events",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      sseAddClient(res, id);
    }),
  );

  app.post(
    "/api/auctions/:id/demo-bots",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const count = req.body?.count ? asNumber(req.body.count, "count") : 50;
      const intervalMinMs = req.body?.intervalMinMs ? asNumber(req.body.intervalMinMs, "intervalMinMs") : 700;
      const intervalMaxMs = req.body?.intervalMaxMs ? asNumber(req.body.intervalMaxMs, "intervalMaxMs") : 1200;
      const out = await startDemoBots(id, { count, intervalMinMs, intervalMaxMs });
      res.json(out);
    }),
  );

  app.get(
    "/api/auctions/:id/results",
    asyncHandler(async (req, res) => {
      const id = requireHex24(asString(req.params.id, "id", 40), "INVALID_AUCTION_ID", "Некорректный Auction ID");
      const results = await getWinnersByRound(id);
      res.json({ results });
    }),
  );
}
