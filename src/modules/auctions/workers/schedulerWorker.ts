import { getMongoDb } from "../../../app/mongo";
import { logger } from "../../../app/logger";
import { roundsCollection } from "../infrastructure/collections";
import { RoundStatus } from "../domain/states";
import { settleRoundById } from "./settlementWorker";

let timer: NodeJS.Timeout | null = null;

export function startSchedulerWorker() {
  if (timer) return;
  timer = setInterval(() => void tick().catch((e) => logger.error("scheduler tick failed", e)), 500);
  logger.info("Scheduler worker started");
}

export async function stopSchedulerWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  const db = getMongoDb();
  const now = new Date();
  const due = await roundsCollection(db)
    .find({ status: RoundStatus.LIVE, endAt: { $lte: now } })
    .limit(3)
    .toArray();

  for (const r of due) {
    await settleRoundById(r._id.toHexString());
  }
}
