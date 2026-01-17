import { MongoClient, ObjectId } from "mongodb";

type Fail = { code: string; msg: string; details?: any };

function env(name: string, def?: string) {
  const v = process.env[name] ?? def;
  if (v == null) throw new Error(`Missing env ${name}`);
  return v;
}

function ok() {
  // eslint-disable-next-line no-console
  console.log("PASSED");
  process.exit(0);
}

function failAll(fails: Fail[]) {
  // eslint-disable-next-line no-console
  console.error("FAILED");
  for (const f of fails) {
    // eslint-disable-next-line no-console
    console.error(`- ${f.code}: ${f.msg}`, f.details ?? "");
  }
  process.exit(1);
}

async function main() {
  const MONGO_URI = env("MONGO_URI", "mongodb://localhost:27017/gift_auctions?replicaSet=rs0");
  const MONGO_DB = env("MONGO_DB", "gift_auctions");
  const CURRENCY = env("CURRENCY", "TEST");

  const client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
  await client.connect();
  const db = client.db(MONGO_DB);

  const wallets = db.collection("wallets");
  const parts = db.collection("participations");
  const ledger = db.collection("ledger_entries");
  const items = db.collection("items");
  const awards = db.collection("awards");
  const rounds = db.collection("rounds");
  const bids = db.collection("bids");

  const fails: Fail[] = [];

  // 1) wallets non-negative
  const negW = await wallets
    .find({ currency: CURRENCY, $or: [{ available: { $lt: 0 } }, { reserved: { $lt: 0 } }] })
    .limit(10)
    .toArray();
  if (negW.length) fails.push({ code: "WALLET_NEGATIVE", msg: "wallet.available/reserved < 0", details: negW });

  // 2) participations non-negative
  const negP = await parts.find({ currency: CURRENCY, reserved: { $lt: 0 } }).limit(10).toArray();
  if (negP.length) fails.push({ code: "PARTICIPATION_NEGATIVE", msg: "participations.reserved < 0", details: negP });

  // 3) ledger idempotency duplicates (defensive check)
  const dupLedger = await ledger
    .aggregate([
      { $match: { idempotencyKey: { $exists: true, $ne: null } } },
      { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();
  if (dupLedger.length) fails.push({ code: "LEDGER_IDEMPOTENCY_DUP", msg: "duplicate ledger idempotencyKey", details: dupLedger });

  // 4) items not awarded twice (awardId uniqueness + status consistency)
  const badItems = await items
    .find({
      $or: [
        { status: "AWARDED", awardId: { $exists: false } },
        { status: "AVAILABLE", awardId: { $exists: true } },
      ],
    })
    .limit(10)
    .toArray();
  if (badItems.length) fails.push({ code: "ITEM_STATUS_MISMATCH", msg: "items status/awardId mismatch", details: badItems });

  const dupAwardIdInItems = await items
    .aggregate([
      { $match: { awardId: { $exists: true, $ne: null } } },
      { $group: { _id: "$awardId", c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();
  if (dupAwardIdInItems.length) fails.push({ code: "ITEM_AWARDID_DUP", msg: "same awardId used by multiple items", details: dupAwardIdInItems });

  // 5) awards count <= items count per auction
  const awardVsItems = await awards
    .aggregate([
      { $group: { _id: "$auctionId", awards: { $sum: 1 } } },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "auctionId",
          as: "items",
        },
      },
      { $addFields: { itemsCount: { $size: "$items" } } },
      { $match: { $expr: { $gt: ["$awards", "$itemsCount"] } } },
      { $limit: 10 },
    ])
    .toArray();
  if (awardVsItems.length) fails.push({ code: "AWARDS_GT_ITEMS", msg: "awards exceed seeded items", details: awardVsItems });

  // 6) (roundId, rank) unique check (defensive)
  const dupRank = await awards
    .aggregate([
      { $group: { _id: { roundId: "$roundId", rank: "$rank" }, c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();
  if (dupRank.length) fails.push({ code: "ROUND_RANK_DUP", msg: "(roundId, rank) duplicate", details: dupRank });

  // 7) winners match top-N for FINISHED rounds
  const finishedRounds = await rounds.find({ status: "FINISHED" }).limit(200).toArray();

  for (const r of finishedRounds) {
    const rId = r._id as ObjectId;
    const N = (r as any).awardCount ?? 0;

    const expected = await bids
      .find({ roundId: rId })
      .sort({ amountTotal: -1, lastBidAt: 1, userId: 1 })
      .limit(N)
      .project({ userId: 1, amountTotal: 1, lastBidAt: 1 })
      .toArray();

    const got = await awards
      .find({ roundId: rId })
      .sort({ rank: 1 })
      .project({ userId: 1, rank: 1, spendAmount: 1 })
      .toArray();

    const k = Math.min(expected.length, got.length);
    for (let i = 0; i < k; i++) {
      if ((expected[i] as any).userId !== (got[i] as any).userId) {
        fails.push({
          code: "WINNER_MISMATCH",
          msg: `round ${rId.toHexString()} rank ${i + 1} winner mismatch`,
          details: {
            expected: expected[i],
            got: got[i],
            roundIndex: (r as any).index,
          },
        });
        break;
      }
    }
  }

  await client.close();

  if (fails.length) failAll(fails);
  ok();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Invariant validator crashed", e);
  process.exit(1);
});
