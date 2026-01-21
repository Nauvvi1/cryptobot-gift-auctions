import dotenv from "dotenv";

dotenv.config();

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017/gift_auctions?replicaSet=rs0",
  demoStartBalance: Number(process.env.DEMO_START_BALANCE ?? 100000),
} as const;
