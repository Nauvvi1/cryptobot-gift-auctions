import { Db } from "mongodb";
import { auctionsCollection, roundsCollection, entriesCollection } from "./collections";

export async function ensureAuctionIndexes(db: Db) {
  await auctionsCollection(db).createIndex({ status: 1, createdAt: -1 });
  await roundsCollection(db).createIndex({ auctionId: 1, index: 1 }, { unique: true });
  await roundsCollection(db).createIndex({ auctionId: 1, status: 1 });
  await roundsCollection(db).createIndex({ endAt: 1, status: 1 });

  // One entry per user per auction (MVP constraint)
  await entriesCollection(db).createIndex({ auctionId: 1, userId: 1 }, { unique: true });
  await entriesCollection(db).createIndex({ auctionId: 1, status: 1, amount: -1, lastBidAt: 1 });
}
