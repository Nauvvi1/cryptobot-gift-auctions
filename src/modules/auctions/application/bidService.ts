import { ObjectId } from "mongodb";
import { getMongoDb, getMongoClient } from "../../../app/mongo";
import { AppError, assert } from "../../../common/errors";
import { auctionsCollection, roundsCollection, entriesCollection } from "../infrastructure/collections";
import { AuctionStatus, EntryStatus, RoundStatus } from "../domain/states";
import { adjustBalancesTx } from "../../users/application/userService";
import { events } from "./eventsService";

function isHex24(s: string) {
  return /^[a-f0-9]{24}$/i.test(s);
}

function fail(code: string, message: string, statusCode = 400, details?: any): never {
  const e = new AppError(code, message, statusCode);
  (e as any).details = details;
  throw e;
}

export async function placeBid(params: { auctionId: string; userId: string; amount: number }) {
  // Validate IDs early to avoid driver exceptions
  if (!isHex24(params.auctionId)) fail("INVALID_AUCTION_ID", "Некорректный Auction ID");
  if (!isHex24(params.userId)) fail("INVALID_USER_ID", "Некорректный User ID");

  const db = getMongoDb();
  const auctionObjectId = new ObjectId(params.auctionId);
  const userObjectId = new ObjectId(params.userId);

  const session = getMongoClient().startSession();

  let didExtend = false;

  try {
    const result = await session.withTransaction(async () => {
      const auction = await auctionsCollection(db).findOne({ _id: auctionObjectId }, { session });
      assert(auction, "NOT_FOUND", "Аукцион не найден", 404);

      if (auction.status !== AuctionStatus.LIVE) {
        fail(
          "AUCTION_NOT_LIVE",
          auction.status === AuctionStatus.COMPLETED ? "Аукцион завершён" : "Аукцион ещё не запущен",
          400,
          { status: auction.status },
        );
      }

      assert(auction.currentRoundId, "STATE", "У аукциона нет активного раунда");

      const round = await roundsCollection(db).findOne({ _id: auction.currentRoundId }, { session });
      assert(round, "STATE", "Активный раунд не найден");
      assert(round.status === RoundStatus.LIVE, "ROUND_NOT_LIVE", "Раунд не активен");

      const now = new Date();
      if (now.getTime() >= round.endAt.getTime()) {
        fail("ROUND_ENDED", "Раунд уже завершён", 400, { endAt: round.endAt });
      }

      const existing = await entriesCollection(db).findOne({ auctionId: auctionObjectId, userId: userObjectId }, { session });

      const prevAmount = existing?.amount ?? 0;

      if (existing && existing.status !== EntryStatus.ACTIVE) {
        fail("ENTRY_NOT_ACTIVE", "Заявка больше не участвует в аукционе", 400, { status: existing.status });
      }

      if (!(params.amount > prevAmount)) {
        fail(
          "BID_TOO_LOW",
          "Ставка должна быть больше вашей текущей ставки",
          400,
          { currentAmount: prevAmount, requestedAmount: params.amount },
        );
      }

      const delta = params.amount - prevAmount;

      // lock delta funds
      await adjustBalancesTx(userObjectId, -delta, +delta, session);

      // upsert entry
      if (!existing) {
        await entriesCollection(db).insertOne(
          {
            _id: new ObjectId(),
            auctionId: auctionObjectId,
            userId: userObjectId,
            amount: params.amount,
            status: EntryStatus.ACTIVE,
            lastBidAt: now,
          },
          { session },
        );
      } else {
        const upd = await entriesCollection(db).updateOne(
          { _id: existing._id, amount: prevAmount, status: EntryStatus.ACTIVE },
          { $set: { amount: params.amount, lastBidAt: now } },
          { session },
        );
        if (upd.modifiedCount !== 1) {
          fail("CONFLICT", "Ставка не применена из-за конкурентного обновления. Повторите попытку.", 409);
        }
      }

      // anti-sniping extension (extend on late bids)
      const thresholdMs = auction.antiSniping.thresholdSec * 1000;
      const extendMs = auction.antiSniping.extendSec * 1000;

      const timeLeft = round.endAt.getTime() - now.getTime();
      if (timeLeft <= thresholdMs && round.extensions < auction.antiSniping.maxExtensions) {
        const newEnd = new Date(round.endAt.getTime() + extendMs);
        const updRound = await roundsCollection(db).findOneAndUpdate(
          { _id: round._id, status: RoundStatus.LIVE, extensions: { $lt: auction.antiSniping.maxExtensions } },
          { $set: { endAt: newEnd }, $inc: { extensions: 1 } },
          { session },
        );
        if (updRound) didExtend = true;
      }

      return { ok: true };
    });

    // Events after commit
    events.topUpdated(params.auctionId, { type: "BID_PLACED" });
    if (didExtend) {
      const db2 = getMongoDb();
      const a = await auctionsCollection(db2).findOne({ _id: auctionObjectId });
      if (a?.currentRoundId) {
        const r = await roundsCollection(db2).findOne({ _id: a.currentRoundId });
        if (r) events.roundUpdated(params.auctionId, r);
      }
    }

    return result;
  } finally {
    await session.endSession();
  }
}
