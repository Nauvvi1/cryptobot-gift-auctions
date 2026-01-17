import type { Server } from "http";
import type { MongoCtx } from "./mongo";
import { logger } from "./logger";

export function installShutdown({ server, mongo }: { server: Server; mongo: MongoCtx }) {
  const shutdown = async () => {
    logger.info("Shutdown requested");
    await new Promise<void>((res) => server.close(() => res()));
    await mongo.client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
