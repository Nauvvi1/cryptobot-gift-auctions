import { MongoClient, Db } from "mongodb";
import { config } from "./config";
import { logger } from "./logger";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<{ client: MongoClient; db: Db }> {
  if (client && db) return { client, db };
  client = new MongoClient(config.mongoUri, {
    // retry writes + majority are important for financial correctness
    retryWrites: true,
    w: "majority",
  });
  await client.connect();
  db = client.db();
  logger.info("Mongo connected");
  return { client, db };
}

export function getMongoClient(): MongoClient {
  if (!client) throw new Error("Mongo not connected");
  return client;
}

export function getMongoDb(): Db {

  if (!db) throw new Error("Mongo not connected");
  return db;
}

export async function disconnectMongo() {
  if (client) await client.close();
  client = null;
  db = null;
}
