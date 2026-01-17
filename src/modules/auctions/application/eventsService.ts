import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { ObjectId } from "mongodb";

export async function listEvents(mongo: MongoCtx, params: { afterSeq?: number; limit?: number; auctionId?: string; roundId?: string }) {
  const c = colls(mongo.db);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);

  const q: any = {};
  if (params.afterSeq != null) q.seq = { $gt: params.afterSeq };
  if (params.auctionId) q.auctionId = new ObjectId(params.auctionId);
  if (params.roundId) q.roundId = new ObjectId(params.roundId);

  const items = await c.outbox.find(q).sort({ seq: 1 }).limit(limit).toArray();
  return {
    items: items.map((e) => ({
      seq: e.seq,
      type: e.type,
      aggregate: e.aggregate,
      aggregateId: e.aggregateId.toHexString(),
      auctionId: e.auctionId?.toHexString(),
      roundId: e.roundId?.toHexString(),
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
