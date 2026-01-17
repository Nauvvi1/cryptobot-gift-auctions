export const config = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 8080),

  MONGO_URI: process.env.MONGO_URI ?? "mongodb://localhost:27017/gift_auctions?replicaSet=rs0",
  MONGO_DB: process.env.MONGO_DB ?? "gift_auctions",

  CURRENCY: process.env.CURRENCY ?? "TEST",

  ENABLE_WORKERS: (process.env.ENABLE_WORKERS ?? "true") === "true",
  WORKER_TICK_MS: Number(process.env.WORKER_TICK_MS ?? 1000),
  OUTBOX_PUBLISH_BATCH: Number(process.env.OUTBOX_PUBLISH_BATCH ?? 200),

  DEFAULT_DEPOSIT: Number(process.env.DEFAULT_DEPOSIT ?? 100000),

  BID_RL_WINDOW_MS: Number(process.env.BID_RL_WINDOW_MS ?? 2000),
  BID_RL_MAX: Number(process.env.BID_RL_MAX ?? 10),
  GLOBAL_BID_RL_WINDOW_MS: Number(process.env.GLOBAL_BID_RL_WINDOW_MS ?? 1000),
  GLOBAL_BID_RL_MAX: Number(process.env.GLOBAL_BID_RL_MAX ?? 2000),
} as const;
