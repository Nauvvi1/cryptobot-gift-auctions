import { Db, Collection } from "mongodb";
import { AuctionDoc, RoundDoc, EntryDoc } from "../domain/types";

export function auctionsCollection(db: Db): Collection<AuctionDoc> {
  return db.collection<AuctionDoc>("auctions");
}

export function roundsCollection(db: Db): Collection<RoundDoc> {
  return db.collection<RoundDoc>("rounds");
}

export function entriesCollection(db: Db): Collection<EntryDoc> {
  return db.collection<EntryDoc>("entries");
}
