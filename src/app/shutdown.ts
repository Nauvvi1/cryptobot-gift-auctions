import { logger } from "./logger";
import { disconnectMongo } from "./mongo";

export function installShutdownHandlers(closeServer: () => Promise<void>) {
  const shutdown = async (signal: string) => {
    logger.info(`Shutting down (${signal})...`);
    try { await closeServer(); } catch (e) { logger.error("closeServer failed", e); }
    try { await disconnectMongo(); } catch (e) { logger.error("disconnectMongo failed", e); }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
