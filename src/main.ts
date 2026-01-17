import { createApp } from "./app/http";
import { connectMongo } from "./app/mongo";
import { initIndexes } from "./modules/auctions/infrastructure/indexes";
import { startWorkers } from "./modules/auctions/workers";
import { config } from "./app/config";
import { logger } from "./app/logger";
import { installShutdown } from "./app/shutdown";

async function main() {
  const mongo = await connectMongo();
  await initIndexes(mongo);

  const app = await createApp(mongo);

  const server = app.listen(config.PORT, () => {
    logger.info(`HTTP listening on :${config.PORT}`);
  });

  installShutdown({ server, mongo });

  if (config.ENABLE_WORKERS) {
    startWorkers(mongo);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
