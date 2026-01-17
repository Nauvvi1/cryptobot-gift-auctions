import { ObjectId } from "mongodb";
import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { HttpError } from "../../../common/errors";
import { config } from "../../../app/config";

export async function listAuctions(mongo: MongoCtx) {
  const c = colls(mongo.db);
  const items = await c.auctions
    .find({ status: { $in: ["ACTIVE", "COMPLETING_REFUNDS", "CANCELING_REFUNDS"] } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();

  const roundIds = items.map((a) => a.activeRoundId).filter(Boolean) as ObjectId[];
  const rounds = roundIds.length ? await c.rounds.find({ _id: { $in: roundIds } }).toArray() : [];
  const roundById = new Map(rounds.map((r) => [r._id.toHexString(), r]));

  return {
    items: items.map((a) => {
      const ar = a.activeRoundId ? roundById.get(a.activeRoundId.toHexString()) : undefined;
      return {
        id: a._id.toHexString(),
        title: a.title,
        status: a.status,
        activeRound: ar
          ? { id: ar._id.toHexString(), index: ar.index, status: ar.status, endAt: ar.endAt.toISOString(), awardCount: ar.awardCount, topBidAmount: ar.stats.topBidAmount ?? null }
          : null,
      };
    }),
  };
}

export async function getAuction(mongo: MongoCtx, auctionId: string) {
  const c = colls(mongo.db);
  const aId = new ObjectId(auctionId);
  const a = await c.auctions.findOne({ _id: aId });
  if (!a) throw new HttpError(404, "NOT_FOUND", "Auction not found");

  const r = a.activeRoundId ? await c.rounds.findOne({ _id: a.activeRoundId }) : null;
  const top = r
    ? await c.bids
        .find({ roundId: r._id })
        .sort({ amountTotal: -1, lastBidAt: 1, userId: 1 })
        .limit(r.awardCount)
        .project({ _id: 0, userId: 1, amountTotal: 1, lastBidAt: 1 })
        .toArray()
    : [];

  return {
    auction: {
      id: a._id.toHexString(),
      title: a.title,
      status: a.status,
      roundConfig: a.roundConfig,
    },
    round: r
      ? {
          id: r._id.toHexString(),
          index: r.index,
          status: r.status,
          startAt: r.startAt.toISOString(),
          endAt: r.endAt.toISOString(),
          extensionsCount: r.extensionsCount,
          awardCount: r.awardCount,
        }
      : null,
    top: top.map((x) => ({ ...x, lastBidAt: x.lastBidAt ? new Date(x.lastBidAt).toISOString() : null })),
  };
}

export async function getRoundTop(mongo: MongoCtx, roundId: string, limit: number) {
  const c = colls(mongo.db);
  const rId = new ObjectId(roundId);
  const r = await c.rounds.findOne({ _id: rId });
  if (!r) throw new HttpError(404, "NOT_FOUND", "Round not found");

  const top = await c.bids
    .find({ roundId: rId })
    .sort({ amountTotal: -1, lastBidAt: 1, userId: 1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray();

  return {
    roundId,
    limit,
    items: top.map((b, idx) => ({
      rank: idx + 1,
      userId: b.userId,
      amountTotal: b.amountTotal,
      lastBidAt: b.lastBidAt.toISOString(),
    })),
  };
}

export async function getMyWallet(mongo: MongoCtx, userId: string) {
  const c = colls(mongo.db);
  const currency = config.CURRENCY;
  const w = await c.wallets.findOne({ userId, currency });
  if (!w) return { userId, currency, available: 0, reserved: 0 };
  // reserved at wallet level is unused for auction; show aggregated per-participation instead
  const parts = await c.participations.find({ userId, currency }).toArray();
  const reserved = parts.reduce((s, p) => s + p.reserved, 0);
  return { userId, currency, available: w.available, reserved };
}

export async function getMyBids(mongo: MongoCtx, userId: string) {
  const c = colls(mongo.db);
  const bids = await c.bids.find({ userId }).sort({ updatedAt: -1 }).limit(100).toArray();
  const roundIds = bids.map((b) => b.roundId);
  const rounds = roundIds.length ? await c.rounds.find({ _id: { $in: roundIds } }).toArray() : [];
  const roundById = new Map(rounds.map((r) => [r._id.toHexString(), r]));
  return {
    items: bids.map((b) => {
      const r = roundById.get(b.roundId.toHexString());
      return {
        auctionId: b.auctionId.toHexString(),
        roundId: b.roundId.toHexString(),
        roundIndex: r?.index ?? null,
        amountTotal: b.amountTotal,
        lastBidAt: b.lastBidAt.toISOString(),
      };
    }),
  };
}

export async function getMyAwards(mongo: MongoCtx, userId: string) {
  const c = colls(mongo.db);
  const awards = await c.awards.find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
  return {
    items: awards.map((a) => ({
      auctionId: a.auctionId.toHexString(),
      roundId: a.roundId.toHexString(),
      roundIndex: a.roundIndex,
      rank: a.rank,
      serial: a.serial,
      itemId: a.itemId.toHexString(),
    })),
  };
}
