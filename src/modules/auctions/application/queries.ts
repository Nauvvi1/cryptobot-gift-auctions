import { ObjectId } from "mongodb";
import { getMongoDb } from "../../../app/mongo";
import { auctionsCollection, roundsCollection, entriesCollection } from "../infrastructure/collections";
import { assert } from "../../../common/errors";

export async function getAuction(auctionId: string) {
  const db = getMongoDb();
  const a = await auctionsCollection(db).findOne({ _id: new ObjectId(auctionId) });
  assert(a, "NOT_FOUND", "Auction not found", 404);
  return a;
}

export async function getCurrentRound(auctionId: string) {
  const db = getMongoDb();
  const a = await getAuction(auctionId);
  assert(a.currentRoundId, "STATE", "Auction has no current round");
  const r = await roundsCollection(db).findOne({ _id: a.currentRoundId });
  assert(r, "STATE", "Round not found");
  return r;
}

export async function getTopEntriesForAuction(auctionId: string, limit = 20) {
  const db = getMongoDb();
  return entriesCollection(db)
    .find({ auctionId: new ObjectId(auctionId), status: "ACTIVE" as const })
    .sort({ amount: -1, lastBidAt: 1 })
    .limit(limit)
    .toArray();
}

export async function getWinnersByRound(auctionId: string) {
  const db = getMongoDb();
  const won = await entriesCollection(db)
    .find({ auctionId: new ObjectId(auctionId), status: "WON" as const })
    .sort({ wonRoundIndex: 1, amount: -1, lastBidAt: 1 })
    .toArray();

  const grouped: Record<string, any[]> = {};
  for (const e of won) {
    const k = String(e.wonRoundIndex ?? 0);
    grouped[k] = grouped[k] ?? [];
    grouped[k].push({ userId: e.userId.toHexString(), amount: e.amount, wonAt: e.wonAt ?? null });
  }
  return grouped;
}
