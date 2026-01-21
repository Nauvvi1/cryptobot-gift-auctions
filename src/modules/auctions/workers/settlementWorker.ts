import { ObjectId } from "mongodb";
import { getMongoDb, getMongoClient } from "../../../app/mongo";
import { assert } from "../../../common/errors";
import { auctionsCollection, roundsCollection, entriesCollection } from "../infrastructure/collections";
import { AuctionStatus, EntryStatus, RoundStatus } from "../domain/states";
import { adjustBalancesTx } from "../../users/application/userService";
import { events } from "../application/eventsService";

export async function settleRoundById(roundId: string) {
  const db = getMongoDb();
  const roundObjectId = new ObjectId(roundId);

  // Acquire "lock" by atomically transitioning LIVE -> FINISHING
  const lock = await roundsCollection(db).findOneAndUpdate(
  { _id: roundObjectId, status: RoundStatus.LIVE },
  { $set: { status: RoundStatus.FINISHING } }
);
if (!lock) return; // someone else is settling

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      const round = await roundsCollection(db).findOne({ _id: roundObjectId }, { session });
      assert(round, "STATE", "Round not found");
      const auction = await auctionsCollection(db).findOne({ _id: round.auctionId }, { session });
      assert(auction, "STATE", "Auction not found");
      assert(auction.status === AuctionStatus.LIVE, "STATE", "Auction not LIVE");

      // compute winners
      const remaining = auction.totalItems - auction.itemsAwarded;
      const winnersCount = Math.min(auction.awardPerRound, Math.max(0, remaining));

      const active = await entriesCollection(db)
        .find({ auctionId: auction._id, status: EntryStatus.ACTIVE }, { session })
        .sort({ amount: -1, lastBidAt: 1 })
        .toArray();

      const winners = active.slice(0, winnersCount);
      const losers = active.slice(winnersCount);

      if (winners.length > 0) {
        const winnerIds = winners.map((e) => e._id);
        await entriesCollection(db).updateMany(
          { _id: { $in: winnerIds } },
          { $set: { status: EntryStatus.WON, wonRoundIndex: round.index, wonAt: new Date() } },
          { session }
        );

        // spend winners locked funds: move locked -> (spent), represented as locked decrease only
        for (const w of winners) {
          await adjustBalancesTx(w.userId, 0, -w.amount, session);
        }
      }

      // losers remain ACTIVE unless auction completes; no change now

      // finish round
      await roundsCollection(db).updateOne(
        { _id: round._id },
        { $set: { status: RoundStatus.FINISHED } },
        { session }
      );

      await auctionsCollection(db).updateOne(
        { _id: auction._id },
        {
          $inc: { itemsAwarded: winners.length },
        },
        { session }
      );

      const auctionAfter = await auctionsCollection(db).findOne({ _id: auction._id }, { session });
      assert(auctionAfter, "STATE", "Auction missing after update");

      const remainingAfter = auctionAfter.totalItems - auctionAfter.itemsAwarded;

      if (remainingAfter > 0) {
        // create next round
        const now = new Date();
        const nextRound = {
          _id: new ObjectId(),
          auctionId: auctionAfter._id,
          index: round.index + 1,
          status: RoundStatus.LIVE,
          startAt: now,
          endAt: new Date(now.getTime() + auctionAfter.roundDurationSec * 1000),
          extensions: 0,
        };
        await roundsCollection(db).insertOne(nextRound, { session });
        await auctionsCollection(db).updateOne(
          { _id: auctionAfter._id },
          { $set: { currentRoundId: nextRound._id } },
          { session }
        );
      } else {
        // complete auction: mark remaining ACTIVE as LOST and refund their locked to available
        await auctionsCollection(db).updateOne(
          { _id: auctionAfter._id },
          { $set: { status: AuctionStatus.COMPLETED }, $unset: { currentRoundId: "" } },
          { session }
        );

        const stillActive = await entriesCollection(db).find(
          { auctionId: auctionAfter._id, status: EntryStatus.ACTIVE },
          { session }
        ).toArray();

        if (stillActive.length > 0) {
          await entriesCollection(db).updateMany(
            { auctionId: auctionAfter._id, status: EntryStatus.ACTIVE },
            { $set: { status: EntryStatus.LOST } },
            { session }
          );

          for (const e of stillActive) {
            // refund full locked amount (which equals entry.amount for ACTIVE entries)
            await adjustBalancesTx(e.userId, +e.amount, -e.amount, session);
          }
        }
      }
    });
  } finally {
    await session.endSession();
  }

  // out-of-transaction events
  const round = await roundsCollection(db).findOne({ _id: roundObjectId });
  const auction = await auctionsCollection(db).findOne({ _id: lock.auctionId });
  if (auction) events.auctionUpdated(auction._id.toHexString(), auction);
  if (round) events.roundUpdated(round.auctionId.toHexString(), round);
  events.topUpdated(lock.auctionId.toHexString(), { type: "ROUND_SETTLED" });
}
