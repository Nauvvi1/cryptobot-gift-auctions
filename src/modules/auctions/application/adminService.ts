import { ObjectId } from "mongodb";
import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now } from "../../../common/time";
import { AuctionStatus, RoundStatus } from "../domain/states";
import type { RoundConfig } from "../domain/types";
import { HttpError } from "../../../common/errors";
import { config } from "../../../app/config";

export async function ensureWallet(
  mongo: MongoCtx,
  userId: string,
  currency: string
) {
  const c = colls(mongo.db);
  const t = now();

  await c.wallets.updateOne(
    { userId, currency },
    {
      $set: {
        updatedAt: t,
      },
      $setOnInsert: {
        userId,
        currency,
        available: 0,
        reserved: 0,
        version: 0,
        createdAt: t,
      },
    },
    { upsert: true }
  );
}


export async function createAuction(mongo: MongoCtx, input: { title: string; roundConfig: RoundConfig }) {
  const c = colls(mongo.db);
  const t = now();
  const doc = {
    _id: new ObjectId(),
    title: input.title,
    status: AuctionStatus.DRAFT,
    roundConfig: input.roundConfig,
    createdAt: t,
    updatedAt: t,
  };
  await c.auctions.insertOne(doc as any);
  return { auctionId: doc._id.toHexString() };
}

export async function seedItems(mongo: MongoCtx, auctionId: string, input: { count: number; namePrefix: string }) {
  const c = colls(mongo.db);
  const aId = new ObjectId(auctionId);
  const t = now();
  const items = Array.from({ length: input.count }).map((_, i) => ({
    _id: new ObjectId(),
    auctionId: aId,
    name: `${input.namePrefix} #${i + 1}`,
    status: "AVAILABLE" as const,
    createdAt: t,
    updatedAt: t,
  }));
  if (items.length) await c.items.insertMany(items);
  return { seeded: items.length };
}

export async function startAuction(mongo: MongoCtx, auctionId: string, input: { firstRoundAwardCount?: number }) {
  const c = colls(mongo.db);
  const aId = new ObjectId(auctionId);
  const a = await c.auctions.findOne({ _id: aId });
  if (!a) throw new HttpError(404, "NOT_FOUND", "Auction not found");
  if (a.status !== AuctionStatus.DRAFT) throw new HttpError(409, "BAD_STATE", "Auction not in DRAFT");

  const t = now();
  const awardCount = input.firstRoundAwardCount ?? a.roundConfig.defaultAwardCount;

  const startAt = t;
  const endAt = new Date(t.getTime() + a.roundConfig.roundDurationSec * 1000);
  const hardEndAt = a.roundConfig.antiSniping.hardDeadlineSec
    ? new Date(t.getTime() + a.roundConfig.antiSniping.hardDeadlineSec * 1000)
    : undefined;

  const roundId = new ObjectId();
  await c.rounds.insertOne({
    _id: roundId,
    auctionId: aId,
    index: 1,
    status: RoundStatus.SCHEDULED,
    startAt,
    endAt,
    hardEndAt,
    extensionsCount: 0,
    awardCount,
    minBid: a.roundConfig.minBid,
    minIncrement: a.roundConfig.minIncrement,
    antiSniping: a.roundConfig.antiSniping,
    stats: { bidsCount: 0, uniqueBidders: 0 },
    createdAt: t,
    updatedAt: t,
  } as any);

  await c.auctions.updateOne(
    { _id: aId },
    { $set: { status: AuctionStatus.ACTIVE, activeRoundId: roundId, updatedAt: t } }
  );

  // outbox event (seq allocated by outbox insert helper)
  await appendOutbox(mongo, {
    type: "AUCTION_STARTED",
    aggregate: "AUCTION",
    aggregateId: aId,
    auctionId: aId,
    payload: { auctionId: aId.toHexString(), roundId: roundId.toHexString() },
  });

  return { roundId: roundId.toHexString(), status: "SCHEDULED" };
}

export async function cancelAuction(mongo: MongoCtx, auctionId: string) {
  const c = colls(mongo.db);
  const aId = new ObjectId(auctionId);
  const a = await c.auctions.findOne({ _id: aId });
  if (!a) throw new HttpError(404, "NOT_FOUND", "Auction not found");
  if (a.status === AuctionStatus.CANCELLED || a.status === AuctionStatus.CANCELING_REFUNDS) {
    return { status: a.status };
  }
  const t = now();
  await c.auctions.updateOne(
    { _id: aId },
    { $set: { status: AuctionStatus.CANCELING_REFUNDS, refundCursor: { lastId: undefined }, updatedAt: t } }
  );

  await appendOutbox(mongo, {
    type: "AUCTION_CANCELLED",
    aggregate: "AUCTION",
    aggregateId: aId,
    auctionId: aId,
    payload: { auctionId: aId.toHexString() },
  });

  return { status: AuctionStatus.CANCELING_REFUNDS };
}

export async function deposit(mongo: MongoCtx, userId: string, amount: number, currency = config.CURRENCY) {
  const c = colls(mongo.db);
  await ensureWallet(mongo, userId, currency);
  const t = now();

  const session = mongo.client.startSession();
  try {
    await session.withTransaction(async () => {
      const ledgerKey = `DEPOSIT:${userId}:${t.getTime()}:${Math.random().toString(16).slice(2)}`;
      await c.ledger.insertOne(
        {
          _id: new ObjectId(),
          userId,
          currency,
          type: "DEPOSIT",
          amount,
          direction: "CREDIT",
          idempotencyKey: ledgerKey,
          createdAt: t,
        },
        { session }
      );

      await c.wallets.updateOne(
        { userId, currency },
        { $inc: { available: amount, version: 1 }, $set: { updatedAt: t } },
        { session }
      );
    });
    return { ok: true };
  } finally {
    await session.endSession();
  }
}

async function nextSeq(mongo: MongoCtx): Promise<number> {
  const c = colls(mongo.db);
  const doc = await c.counters.findOneAndUpdate(
    { _id: "outbox_seq" },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  if (!doc) throw new Error("Failed to allocate outbox seq");
  return doc.value;
}


export async function appendOutbox(
  mongo: MongoCtx,
  e: {
    type: string;
    aggregate: "ROUND" | "AUCTION";
    aggregateId: ObjectId;
    auctionId?: ObjectId;
    roundId?: ObjectId;
    payload: any;
  }
) {
  const c = colls(mongo.db);
  const t = now();
  const seq = await nextSeq(mongo);
  await c.outbox.insertOne({
    _id: new ObjectId(),
    seq,
    type: e.type,
    aggregate: e.aggregate,
    aggregateId: e.aggregateId,
    auctionId: e.auctionId,
    roundId: e.roundId,
    payload: e.payload,
    status: "NEW",
    createdAt: t,
  } as any);
  return seq;
}
