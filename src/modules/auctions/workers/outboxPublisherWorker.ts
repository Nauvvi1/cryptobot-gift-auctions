import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now } from "../../../common/time";
import { sseHub } from "../realtime/sseHub";
import { outboxPublished } from "../../../app/metrics";
import { config } from "../../../app/config";

export function startOutboxPublisherWorker(mongo: MongoCtx, tickMs: number) {
  const c = colls(mongo.db);

  setInterval(async () => {
    const batch = await c.outbox.find({ status: "NEW" }).sort({ seq: 1 }).limit(config.OUTBOX_PUBLISH_BATCH).toArray();
    if (!batch.length) return;

    for (const e of batch) {
      const payload = {
        seq: e.seq,
        type: e.type,
        aggregate: e.aggregate,
        aggregateId: e.aggregateId.toHexString(),
        auctionId: e.auctionId?.toHexString(),
        roundId: e.roundId?.toHexString(),
        ...e.payload,
        createdAt: e.createdAt.toISOString(),
      };

      sseHub.publish(payload);
      outboxPublished.inc();

      await c.outbox.updateOne({ _id: e._id }, { $set: { status: "PUBLISHED", publishedAt: now() } });
    }
  }, tickMs);
}
