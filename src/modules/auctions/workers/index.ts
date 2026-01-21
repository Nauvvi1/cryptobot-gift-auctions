import { startSchedulerWorker, stopSchedulerWorker } from "./schedulerWorker";

export const workers = {
  start: () => startSchedulerWorker(),
  stop: () => stopSchedulerWorker(),
};
