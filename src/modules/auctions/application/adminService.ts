import { ObjectId } from "mongodb";
import { getMongoDb, getMongoClient } from "../../../app/mongo";
import { assert } from "../../../common/errors";
import { auctionsCollection, roundsCollection } from "../infrastructure/collections";
import { AuctionStatus, RoundStatus } from "../domain/states";
import { events } from "./eventsService";

export async function createAuction(input: {
  title: string;
  totalItems: number;
  awardPerRound: number;
  roundDurationSec: number;
  antiSniping: { thresholdSec: number; extendSec: number; maxExtensions: number };
}) {
  const db = getMongoDb();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    title: input.title,
    status: AuctionStatus.DRAFT,
    totalItems: input.totalItems,
    awardPerRound: input.awardPerRound,
    roundDurationSec: input.roundDurationSec,
    antiSniping: input.antiSniping,
    itemsAwarded: 0,
    currentRoundId: undefined,
    createdAt: now,
  };
  await auctionsCollection(db).insertOne(doc);
  return doc;
}

export async function startAuction(auctionId: string) {
  const db = getMongoDb();
  const auction = await auctionsCollection(db).findOne({ _id: new ObjectId(auctionId) });
  assert(auction, "NOT_FOUND", "Auction not found", 404);
  assert(auction.status === AuctionStatus.DRAFT, "STATE", "Auction must be DRAFT to start");

  const now = new Date();
  const round = {
    _id: new ObjectId(),
    auctionId: auction._id,
    index: 1,
    status: RoundStatus.LIVE,
    startAt: now,
    endAt: new Date(now.getTime() + auction.roundDurationSec * 1000),
    extensions: 0,
  };

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await roundsCollection(db).insertOne(round, { session });
      await auctionsCollection(db).updateOne(
        { _id: auction._id, status: AuctionStatus.DRAFT },
        { $set: { status: AuctionStatus.LIVE, currentRoundId: round._id } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  events.auctionUpdated(auctionId, { type: "STARTED" });
  events.roundUpdated(auctionId, round);
  return round;
}
