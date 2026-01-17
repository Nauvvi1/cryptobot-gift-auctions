import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now } from "../../../common/time";
import { RoundStatus } from "../domain/states";
import { appendOutbox } from "../application/adminService";

export function startSchedulerWorker(mongo: MongoCtx, tickMs: number) {
  const c = colls(mongo.db);

  setInterval(async () => {
    const t = now();

    const started = await c.rounds.findOneAndUpdate(
      { status: RoundStatus.SCHEDULED, startAt: { $lte: t } },
      { $set: { status: RoundStatus.LIVE, updatedAt: t } },
      { returnDocument: "after" }
    );

    if (started) {
      await appendOutbox(mongo, {
        type: "ROUND_STARTED",
        aggregate: "ROUND",
        aggregateId: started._id,
        auctionId: started.auctionId,
        roundId: started._id,
        payload: {
          roundId: started._id.toHexString(),
          auctionId: started.auctionId.toHexString(),
          index: started.index,
          startAt: started.startAt.toISOString(),
        },
      });
    }

    const locked = await c.rounds.findOneAndUpdate(
      { status: RoundStatus.LIVE, endAt: { $lte: t } },
      { $set: { status: RoundStatus.LOCKED, updatedAt: t } },
      { returnDocument: "after" }
    );

    if (locked) {
      await appendOutbox(mongo, {
        type: "ROUND_LOCKED",
        aggregate: "ROUND",
        aggregateId: locked._id,
        auctionId: locked.auctionId,
        roundId: locked._id,
        payload: {
          roundId: locked._id.toHexString(),
          auctionId: locked.auctionId.toHexString(),
          index: locked.index,
          endAt: locked.endAt.toISOString(),
        },
      });
    }
  }, tickMs);
}
