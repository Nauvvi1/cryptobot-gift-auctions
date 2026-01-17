import type { MongoCtx } from "../../../app/mongo";
import { config } from "../../../app/config";
import { startSchedulerWorker } from "./schedulerWorker";
import { startSettlementWorker } from "./settlementWorker";
import { startRefundWorker } from "./refundWorker";
import { startOutboxPublisherWorker } from "./outboxPublisherWorker";

export function startWorkers(mongo: MongoCtx) {
  startSchedulerWorker(mongo, config.WORKER_TICK_MS);
  startSettlementWorker(mongo, config.WORKER_TICK_MS);
  startRefundWorker(mongo, config.WORKER_TICK_MS);
  startOutboxPublisherWorker(mongo, config.WORKER_TICK_MS);
}
