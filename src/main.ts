import { createHttpServer } from "./app/http";
import { config } from "./app/config";
import { logger } from "./app/logger";
import { connectMongo, getMongoDb } from "./app/mongo";
import { ensureAuctionIndexes } from "./modules/auctions/infrastructure/indexes";
import { workers } from "./modules/auctions/workers";
import { installShutdownHandlers } from "./app/shutdown";

async function bootstrap() {
  await connectMongo();
  await ensureAuctionIndexes(getMongoDb());

  const app = createHttpServer();
  const server = app.listen(config.port, () => logger.info(`HTTP on :${config.port}`));

  workers.start();

  installShutdownHandlers(async () => {
    workers.stop();
    server.close();
  });
}

bootstrap().catch((e) => {
  logger.error("Fatal bootstrap error", e);
  process.exit(1);
});
