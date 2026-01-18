import { ObjectId, MongoServerError } from "mongodb";
import type { MongoCtx } from "../../../app/mongo";
import { colls } from "../infrastructure/collections";
import { now, sec } from "../../../common/time";
import { HttpError } from "../../../common/errors";
import { RoundStatus } from "../domain/states";
import { assertNonNegative } from "../domain/invariants";
import { bidConflicts, txRetries } from "../../../app/metrics";
import { appendOutbox } from "./adminService";
import { config } from "../../../app/config";

type PlaceBidInput = { amountTotal: number };
type PlaceBidResponse = any;

function isDupKey(e: any) {
  return e instanceof MongoServerError && e.code === 11000;
}

function bidTooLow(details: any) {
  // keep code stable; UI will render human-friendly message based on details
  return new HttpError(409, "BID_TOO_LOW", "Bid rejected", details);
}

export async function placeOrIncreaseBid(
  mongo: MongoCtx,
  params: { roundId: string; userId: string; idempotencyKey: string; input: PlaceBidInput }
): Promise<PlaceBidResponse> {
  const c = colls(mongo.db);
  const roundId = new ObjectId(params.roundId);
  const userId = params.userId;
  const idem = params.idempotencyKey;
  const currency = config.CURRENCY;

  // fast replay
  const existingReceipt = await c.receipts.findOne({ idempotencyKey: idem });
  if (existingReceipt) return existingReceipt.response;

  const session = mongo.client.startSession();

  // retry whole transaction on transient errors
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await session.withTransaction(async () => {
        const r = await c.rounds.findOne({ _id: roundId }, { session });
        if (!r) {
          throw new HttpError(404, "NOT_FOUND", "Round not found", { roundId: params.roundId });
        }

        const nowTs = now();

        if (r.status !== RoundStatus.LIVE) {
          throw new HttpError(409, "ROUND_NOT_LIVE", "Round not live", {
            roundId: params.roundId,
            status: r.status,
            startAt: r.startAt?.toISOString?.(),
            endAt: r.endAt?.toISOString?.(),
            now: nowTs.toISOString(),
          });
        }

        if (nowTs >= r.endAt) {
          throw new HttpError(409, "ROUND_NOT_LIVE", "Round ended", {
            roundId: params.roundId,
            status: r.status,
            endAt: r.endAt?.toISOString?.(),
            now: nowTs.toISOString(),
          });
        }

        const auctionId = r.auctionId;

        // ensure wallet + participation exist
        await c.wallets.updateOne(
          { userId, currency },
          {
            $setOnInsert: {
              _id: new ObjectId(),
              userId,
              currency,
              available: 0,
              reserved: 0,
              version: 0,
              createdAt: nowTs,
            },
            $set: { updatedAt: nowTs },
          },
          { upsert: true, session }
        );

        await c.participations.updateOne(
          { userId, auctionId, currency },
          {
            $setOnInsert: {
              _id: new ObjectId(),
              userId,
              auctionId,
              currency,
              reserved: 0,
              version: 0,
              createdAt: nowTs,
            },
            $set: { updatedAt: nowTs },
          },
          { upsert: true, session }
        );


        const wallet = await c.wallets.findOne({ userId, currency }, { session });
        const part = await c.participations.findOne({ userId, auctionId, currency }, { session });
        if (!wallet || !part) throw new HttpError(500, "INTERNAL", "Wallet/participation missing");

        // find bid
        const bid = await c.bids.findOne({ roundId, userId }, { session });
        const prevTotal = bid ? bid.amountTotal : part.reserved;

        const amountTotal = params.input.amountTotal;

        // Validation with explicit, UI-friendly details
        if (amountTotal < r.minBid) {
          throw bidTooLow({
            reason: "MIN_BID",
            minBid: r.minBid,
            amountTotal,
            prevTotal,
            minIncrement: r.minIncrement,
          });
        }

        if (amountTotal <= prevTotal) {
          throw bidTooLow({
            reason: "NON_INCREASING",
            prevTotal,
            amountTotal,
            requiredMinTotal: prevTotal + Math.max(1, r.minIncrement),
            minIncrement: r.minIncrement,
          });
        }

        const delta = amountTotal - prevTotal;

        if (delta < r.minIncrement) {
          throw bidTooLow({
            reason: "MIN_INCREMENT",
            minIncrement: r.minIncrement,
            prevTotal,
            amountTotal,
            requiredMinTotal: prevTotal + r.minIncrement,
          });
        }

        // idempotency anchor: ledger insert
        try {
          await c.ledger.insertOne(
            {
              _id: new ObjectId(),
              userId,
              currency,
              type: "BID_RESERVE",
              amount: delta,
              direction: "DEBIT",
              auctionId,
              roundId,
              idempotencyKey: idem,
              meta: { prevTotal, amountTotal, delta },
              createdAt: nowTs,
            },
            { session }
          );
        } catch (e: any) {
          if (isDupKey(e)) {
            const receipt = await c.receipts.findOne({ idempotencyKey: idem }, { session });
            if (receipt) return receipt.response;
            throw new HttpError(409, "IDEMPOTENCY_RETRY", "Retry idempotency read", { idempotencyKey: idem });
          }
          throw e;
        }

        // money updates (no negative)
        const wUpd = await c.wallets.updateOne(
          { userId, currency, available: { $gte: delta } },
          { $inc: { available: -delta, version: 1 }, $set: { updatedAt: nowTs } },
          { session }
        );

        if (wUpd.matchedCount === 0) {
          // We have wallet loaded already (wallet.available) - provide useful info
          throw new HttpError(409, "INSUFFICIENT_FUNDS", "Not enough funds", {
            available: wallet.available,
            requiredDelta: delta,
            prevTotal,
            amountTotal,
            currency,
          });
        }

        await c.participations.updateOne(
          { userId, auctionId, currency },
          { $inc: { reserved: delta, version: 1 }, $set: { updatedAt: nowTs } },
          { session }
        );

        // CAS on bid to avoid double delta charge when two different idempotency keys hit concurrently
        const newTotal = prevTotal + delta;
        const maxCASRetries = 3;
        let casOk = false;

        for (let cas = 0; cas < maxCASRetries; cas++) {
          if (bid) {
            const u = await c.bids.updateOne(
              { roundId, userId, amountTotal: prevTotal },
              { $set: { amountTotal: newTotal, lastBidAt: nowTs, updatedAt: nowTs }, $inc: { version: 1 } },
              { session }
            );
            if (u.matchedCount === 1) {
              casOk = true;
              break;
            }
          } else {
            try {
              await c.bids.insertOne(
                {
                  _id: new ObjectId(),
                  roundId,
                  auctionId,
                  userId,
                  amountTotal: newTotal,
                  firstBidAt: nowTs,
                  lastBidAt: nowTs,
                  version: 0,
                  createdAt: nowTs,
                  updatedAt: nowTs,
                },
                { session }
              );
              casOk = true;
              break;
            } catch (e: any) {
              if (!isDupKey(e)) throw e;
              // another insert won, continue
            }
          }

          bidConflicts.inc();

          // re-read latest bid/participation and recompute (prevent over-reserve)
          const latestBid = await c.bids.findOne({ roundId, userId }, { session });
          const latestPart = await c.participations.findOne({ userId, auctionId, currency }, { session });
          if (!latestPart) throw new HttpError(500, "INTERNAL", "Participation missing");

          const latestPrev = latestBid ? latestBid.amountTotal : latestPart.reserved;
          if (latestPrev >= newTotal) {
            casOk = true;
            break;
          }

          throw new HttpError(409, "BID_CONFLICT", "Concurrent bid update, retry request", {
            roundId: params.roundId,
            userId,
            prevTotal,
            attemptedTotal: amountTotal,
          });
        }

        if (!casOk) {
          throw new HttpError(409, "BID_CONFLICT", "Concurrent bid update", { roundId: params.roundId, userId });
        }

        // stats (best-effort)
        await c.rounds.updateOne(
          { _id: roundId },
          { $inc: { "stats.bidsCount": 1 }, $set: { "stats.topBidAmount": undefined, updatedAt: nowTs } },
          { session }
        );

        // anti-sniping: pipeline update from current endAt, guarded by conditions
        const thresholdMs = sec(r.antiSniping.thresholdSec);
        const extendMs = sec(r.antiSniping.extendSec);
        const hardEndAt =
          r.hardEndAt ??
          (r.antiSniping.hardDeadlineSec
            ? new Date(r.startAt.getTime() + sec(r.antiSniping.hardDeadlineSec))
            : undefined);

        let extended = false;
        if (r.antiSniping.thresholdSec > 0 && r.antiSniping.extendSec > 0) {
          const upd = await c.rounds.updateOne(
            {
              _id: roundId,
              status: RoundStatus.LIVE,
              endAt: { $gt: nowTs },
              ...(hardEndAt
                ? {
                  $expr: {
                    $and: [
                      { $lte: [{ $subtract: ["$endAt", nowTs] }, thresholdMs] },
                      { $lt: ["$extensionsCount", "$antiSniping.maxExtensions"] },
                      { $lte: [{ $add: ["$endAt", extendMs] }, hardEndAt] },
                    ],
                  },
                }
                : {
                  $expr: {
                    $and: [
                      { $lte: [{ $subtract: ["$endAt", nowTs] }, thresholdMs] },
                      { $lt: ["$extensionsCount", "$antiSniping.maxExtensions"] },
                    ],
                  },
                }),
            },
            [
              {
                $set: {
                  endAt: { $add: ["$endAt", extendMs] },
                  extensionsCount: { $add: ["$extensionsCount", 1] },
                  updatedAt: nowTs,
                },
              },
            ],
            { session }
          );
          extended = upd.modifiedCount === 1;
        }

        const walletAfter = await c.wallets.findOne({ userId, currency }, { session });
        const partAfter = await c.participations.findOne({ userId, auctionId, currency }, { session });
        if (!walletAfter || !partAfter) throw new HttpError(500, "INTERNAL", "Wallet/part missing");

        assertNonNegative("wallet.available", walletAfter.available);
        assertNonNegative("participation.reserved", partAfter.reserved);

        await appendOutbox(mongo, {
          type: "BID_ACCEPTED",
          aggregate: "ROUND",
          aggregateId: roundId,
          auctionId,
          roundId,
          payload: {
            roundId: roundId.toHexString(),
            auctionId: auctionId.toHexString(),
            userId,
            amountTotal,
            delta,
            ts: nowTs.toISOString(),
          },
        });

        if (extended) {
          const rr = await c.rounds.findOne({ _id: roundId }, { session });
          await appendOutbox(mongo, {
            type: "ROUND_EXTENDED",
            aggregate: "ROUND",
            aggregateId: roundId,
            auctionId,
            roundId,
            payload: { roundId: roundId.toHexString(), endAt: rr?.endAt?.toISOString() },
          });
        }

        const response = {
          accepted: true,
          round: {
            id: roundId.toHexString(),
            status: RoundStatus.LIVE,
            endAt: (await c.rounds.findOne({ _id: roundId }, { session }))!.endAt.toISOString(),
            extended,
          },
          bid: { userId, amountTotal, delta },
          wallet: { available: walletAfter.available, reserved: partAfter.reserved, currency },
        };

        await c.receipts.insertOne(
          { _id: new ObjectId(), idempotencyKey: idem, userId, roundId, response, createdAt: nowTs },
          { session }
        );

        return response;
      });

      return result;
    } catch (e: any) {
      if (e?.errorLabels?.includes?.("TransientTransactionError") || e?.errorLabels?.includes?.("UnknownTransactionCommitResult")) {
        txRetries.inc();
        continue;
      }
      throw e;
    }
  }

  await session.endSession();
  throw new HttpError(503, "TX_RETRY_EXHAUSTED", "Try again");
}
