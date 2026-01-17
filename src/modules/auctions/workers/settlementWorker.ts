import { ObjectId, MongoServerError } from "mongodb";
import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now } from "../../../common/time";
import { AuctionStatus, RoundStatus } from "../domain/states";
import { HttpError } from "../../../common/errors";
import { appendOutbox } from "../application/adminService";
import { settlementDuration } from "../../../app/metrics";
import { config } from "../../../app/config";

function isDupKey(e: any) {
  return e instanceof MongoServerError && e.code === 11000;
}

function awardIdFor(roundId: ObjectId, rank: number) {
  return `A:${roundId.toHexString()}:${rank}`;
}

function settleSpendKey(roundId: ObjectId, userId: string) {
  return `SETTLE:SPEND:${roundId.toHexString()}:${userId}`;
}

export function startSettlementWorker(mongo: MongoCtx, tickMs: number) {
  const c = colls(mongo.db);

  setInterval(async () => {
    const timer = settlementDuration.startTimer();

    const r = await c.rounds.findOneAndUpdate(
      { status: RoundStatus.LOCKED },
      { $set: { status: RoundStatus.SETTLING, updatedAt: now() } },
      { returnDocument: "after" }
    );
    
    if (!r) return;
    
    const session = mongo.client.startSession();
    try {
      await session.withTransaction(async () => {
        const roundFresh = await c.rounds.findOne({ _id: r._id }, { session });
        if (!roundFresh) throw new HttpError(404, "NOT_FOUND", "Round not found");
        if (roundFresh.status !== RoundStatus.SETTLING) return;

        const auction = await c.auctions.findOne({ _id: roundFresh.auctionId }, { session });
        if (!auction) throw new HttpError(404, "NOT_FOUND", "Auction not found");

        // Determine top-N deterministically
        const top = await c.bids
          .find({ roundId: roundFresh._id }, { session })
          .sort({ amountTotal: -1, lastBidAt: 1, userId: 1 })
          .limit(roundFresh.awardCount)
          .toArray();

        // Pick N available items
        const items = await c.items
          .find({ auctionId: auction._id, status: "AVAILABLE" }, { session })
          .sort({ _id: 1 })
          .limit(top.length)
          .toArray();

        const awardedCount = Math.min(top.length, items.length);

        // Award loop: idempotent deterministic awardId + transactional mark item
        for (let i = 0; i < awardedCount; i++) {
          const bidder = top[i];
          const item = items[i];
          const rank = i + 1;

          const aId = awardIdFor(roundFresh._id, rank);
          const exists = await c.awards.findOne({ _id: aId }, { session });
          if (exists) continue;

          // mark item as awarded (guard against double award)
          const itemUpd = await c.items.updateOne(
            { _id: item._id, status: "AVAILABLE" },
            { $set: { status: "AWARDED", awardedToUserId: bidder.userId, awardId: aId, updatedAt: now() } },
            { session }
          );
          if (itemUpd.matchedCount === 0) continue;

          const serial = `${roundFresh.index}-${rank}`;
          const spendAmount = bidder.amountTotal;

          await c.awards.insertOne(
            {
              _id: aId,
              auctionId: auction._id,
              roundId: roundFresh._id,
              roundIndex: roundFresh.index,
              userId: bidder.userId,
              itemId: item._id,
              rank,
              serial,
              spendAmount,
              createdAt: now(),
            },
            { session }
          );

          // Spend reserved (per-auction participation), idempotent ledger key
          const spendKey = settleSpendKey(roundFresh._id, bidder.userId);
          try {
            await c.ledger.insertOne(
              {
                _id: new ObjectId(),
                userId: bidder.userId,
                currency: config.CURRENCY,
                type: "BID_SPEND",
                amount: spendAmount,
                direction: "DEBIT",
                auctionId: auction._id,
                roundId: roundFresh._id,
                awardId: aId,
                idempotencyKey: spendKey,
                createdAt: now(),
              },
              { session }
            );

            await c.participations.updateOne(
              { userId: bidder.userId, auctionId: auction._id, currency: config.CURRENCY, reserved: { $gte: spendAmount } },
              { $inc: { reserved: -spendAmount, version: 1 }, $set: { updatedAt: now() } },
              { session }
            );
          } catch (e: any) {
            if (!isDupKey(e)) throw e;
          }

          await appendOutbox(mongo, {
            type: "AWARD_ISSUED",
            aggregate: "ROUND",
            aggregateId: roundFresh._id,
            auctionId: auction._id,
            roundId: roundFresh._id,
            payload: { roundId: roundFresh._id.toHexString(), userId: bidder.userId, rank, serial, itemId: item._id.toHexString() },
          });
        }

        // Finish round
        await c.rounds.updateOne(
          { _id: roundFresh._id },
          { $set: { status: RoundStatus.FINISHED, updatedAt: now() } },
          { session }
        );

        await appendOutbox(mongo, {
          type: "ROUND_SETTLED",
          aggregate: "ROUND",
          aggregateId: roundFresh._id,
          auctionId: auction._id,
          roundId: roundFresh._id,
          payload: { roundId: roundFresh._id.toHexString(), index: roundFresh.index, awarded: awardedCount },
        });

        // items remaining?
        const remaining = await c.items.countDocuments({ auctionId: auction._id, status: "AVAILABLE" }, { session });

        if (remaining <= 0) {
          // move to refund completion flow (batched)
          await c.auctions.updateOne(
            { _id: auction._id },
            { $set: { status: AuctionStatus.COMPLETING_REFUNDS, refundCursor: { lastId: undefined }, updatedAt: now() }, $unset: { activeRoundId: "" } },
            { session }
          );
          await appendOutbox(mongo, {
            type: "AUCTION_ITEMS_DEPLETED",
            aggregate: "AUCTION",
            aggregateId: auction._id,
            auctionId: auction._id,
            payload: { auctionId: auction._id.toHexString() },
          });
          return;
        }

        // Create next round
        const nextIndex = roundFresh.index + 1;
        const startAt = now();
        const endAt = new Date(startAt.getTime() + auction.roundConfig.roundDurationSec * 1000);
        const hardEndAt = auction.roundConfig.antiSniping.hardDeadlineSec
          ? new Date(startAt.getTime() + auction.roundConfig.antiSniping.hardDeadlineSec * 1000)
          : undefined;

        const nextRoundId = new ObjectId();
        await c.rounds.insertOne(
          {
            _id: nextRoundId,
            auctionId: auction._id,
            index: nextIndex,
            status: RoundStatus.SCHEDULED,
            startAt,
            endAt,
            hardEndAt,
            extensionsCount: 0,
            awardCount: auction.roundConfig.defaultAwardCount,
            minBid: auction.roundConfig.minBid,
            minIncrement: auction.roundConfig.minIncrement,
            antiSniping: auction.roundConfig.antiSniping,
            stats: { bidsCount: 0, uniqueBidders: 0 },
            createdAt: now(),
            updatedAt: now(),
          } as any,
          { session }
        );

        await c.auctions.updateOne(
          { _id: auction._id },
          { $set: { activeRoundId: nextRoundId, updatedAt: now() } },
          { session }
        );

        await appendOutbox(mongo, {
          type: "NEXT_ROUND_SCHEDULED",
          aggregate: "AUCTION",
          aggregateId: auction._id,
          auctionId: auction._id,
          roundId: nextRoundId,
          payload: { auctionId: auction._id.toHexString(), roundId: nextRoundId.toHexString(), index: nextIndex, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
        });
      });
    } catch (e: any) {
      // if settlement tx fails, revert round to LOCKED for retry
      await c.rounds.updateOne({ _id: r._id, status: RoundStatus.SETTLING }, { $set: { status: RoundStatus.LOCKED, updatedAt: now() } });
      // eslint-disable-next-line no-console
      console.error("settlement error", e);
    } finally {
      await session.endSession();
      timer();
    }
  }, tickMs);
}
