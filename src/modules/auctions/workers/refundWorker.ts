import { ObjectId, MongoServerError } from "mongodb";
import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now } from "../../../common/time";
import { AuctionStatus } from "../domain/states";
import { appendOutbox } from "../application/adminService";
import { config } from "../../../app/config";

function isDupKey(e: any) {
  return e instanceof MongoServerError && e.code === 11000;
}

function refundKey(auctionId: ObjectId, userId: string) {
  return `AUCTION:REFUND:${auctionId.toHexString()}:${userId}`;
}

export function startRefundWorker(mongo: MongoCtx, tickMs: number) {
  const c = colls(mongo.db);

  setInterval(async () => {
    const auction = await c.auctions.findOne({ status: { $in: [AuctionStatus.COMPLETING_REFUNDS, AuctionStatus.CANCELING_REFUNDS] } });
    if (!auction) return;

    const lastId = auction.refundCursor?.lastId;
    const q: any = { auctionId: auction._id, currency: config.CURRENCY, reserved: { $gt: 0 } };
    if (lastId) q._id = { $gt: new ObjectId(lastId) };

    const batch = await c.participations.find(q).sort({ _id: 1 }).limit(500).toArray();
    if (!batch.length) {
      // finalize
      const finalStatus = auction.status === AuctionStatus.CANCELING_REFUNDS ? AuctionStatus.CANCELLED : AuctionStatus.COMPLETED;
      await c.auctions.updateOne({ _id: auction._id }, { $set: { status: finalStatus, updatedAt: now() } });
      await appendOutbox(mongo, {
        type: "AUCTION_REFUNDS_COMPLETED",
        aggregate: "AUCTION",
        aggregateId: auction._id,
        auctionId: auction._id,
        payload: { auctionId: auction._id.toHexString(), status: finalStatus },
      });
      return;
    }

    for (const p of batch) {
      const session = mongo.client.startSession();
      try {
        await session.withTransaction(async () => {
          const latest = await c.participations.findOne({ _id: p._id }, { session });
          if (!latest || latest.reserved <= 0) return;

          const amount = latest.reserved;
          const key = refundKey(auction._id, latest.userId);

          try {
            await c.ledger.insertOne(
              {
                _id: new ObjectId(),
                userId: latest.userId,
                currency: config.CURRENCY,
                type: "BID_REFUND",
                amount,
                direction: "CREDIT",
                auctionId: auction._id,
                idempotencyKey: key,
                createdAt: now(),
              },
              { session }
            );

            await c.participations.updateOne(
              { _id: latest._id, reserved: { $gte: amount } },
              { $inc: { reserved: -amount, version: 1 }, $set: { updatedAt: now() } },
              { session }
            );

            await c.wallets.updateOne(
              { userId: latest.userId, currency: config.CURRENCY },
              { $inc: { available: amount, version: 1 }, $set: { updatedAt: now() } },
              { upsert: true, session }
            );

            await appendOutbox(mongo, {
              type: "REFUND_DONE",
              aggregate: "AUCTION",
              aggregateId: auction._id,
              auctionId: auction._id,
              payload: { auctionId: auction._id.toHexString(), userId: latest.userId, amount },
            });
          } catch (e: any) {
            if (!isDupKey(e)) throw e;
          }
        });
      } finally {
        await session.endSession();
      }
    }

    const last = batch[batch.length - 1]._id.toHexString();
    await c.auctions.updateOne({ _id: auction._id }, { $set: { refundCursor: { lastId: last }, updatedAt: now() } });
  }, tickMs);
}
