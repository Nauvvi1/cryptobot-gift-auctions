import { MongoClient, Db } from "mongodb";
import { config } from "./config";
import { logger } from "./logger";

export type MongoCtx = { client: MongoClient; db: Db };

export async function connectMongo(): Promise<MongoCtx> {
  const client = new MongoClient(config.MONGO_URI, {
    maxPoolSize: 100,
    retryWrites: true,
  });

  await client.connect();
  const db = client.db(config.MONGO_DB);

  logger.info("Mongo connected", { db: config.MONGO_DB });
  return { client, db };
}
