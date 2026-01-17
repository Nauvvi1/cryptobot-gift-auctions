import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpLatency = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP latency ms",
  labelNames: ["method", "route", "status"],
  buckets: [5, 10, 20, 50, 100, 200, 400, 800, 1500, 3000, 6000],
});
registry.registerMetric(httpLatency);

export const bidConflicts = new client.Counter({
  name: "bid_conflicts_total",
  help: "CAS conflicts / retries for bid",
});
registry.registerMetric(bidConflicts);

export const txRetries = new client.Counter({
  name: "mongo_tx_retries_total",
  help: "Mongo transaction retries",
});
registry.registerMetric(txRetries);

export const settlementDuration = new client.Histogram({
  name: "settlement_duration_ms",
  help: "Round settlement duration ms",
  buckets: [10, 20, 50, 100, 200, 500, 1000, 2500, 5000, 10000, 20000],
});
registry.registerMetric(settlementDuration);

export const outboxPublished = new client.Counter({
  name: "outbox_published_total",
  help: "Outbox events published",
});
registry.registerMetric(outboxPublished);
