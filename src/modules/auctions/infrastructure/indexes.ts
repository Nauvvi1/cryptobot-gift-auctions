import type { MongoCtx } from "../../../app/mongo";
import { colls } from "./collections";

export async function initIndexes(mongo: MongoCtx) {
  const c = colls(mongo.db);

  await c.bids.createIndex({ roundId: 1, userId: 1 }, { unique: true });
  await c.bids.createIndex({ roundId: 1, amountTotal: -1, lastBidAt: 1, userId: 1 });

  await c.rounds.createIndex({ auctionId: 1, index: 1 }, { unique: true });
  await c.rounds.createIndex({ status: 1, endAt: 1 });
  await c.rounds.createIndex({ auctionId: 1, status: 1 });

  await c.ledger.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
  await c.ledger.createIndex({ userId: 1, createdAt: -1 });
  await c.ledger.createIndex({ auctionId: 1, roundId: 1, createdAt: 1 });

  await c.wallets.createIndex({ userId: 1, currency: 1 }, { unique: true });

  await c.participations.createIndex({ userId: 1, auctionId: 1, currency: 1 }, { unique: true });

  await c.items.createIndex({ auctionId: 1, status: 1 });
  await c.items.createIndex({ awardId: 1 });

  await c.awards.createIndex({ roundId: 1, rank: 1 }, { unique: true });
  await c.awards.createIndex({ itemId: 1 }, { unique: true });
  await c.awards.createIndex({ userId: 1, createdAt: -1 });

  await c.outbox.createIndex({ status: 1, createdAt: 1 });
  await c.outbox.createIndex({ seq: 1 }, { unique: true });

  await c.receipts.createIndex({ idempotencyKey: 1 }, { unique: true });
}
