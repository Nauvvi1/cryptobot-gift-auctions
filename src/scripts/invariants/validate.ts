import { connectMongo, getMongoDb } from "../../app/mongo";
import { auctionsCollection, entriesCollection } from "../../modules/auctions/infrastructure/collections";
import { usersCollection } from "../../modules/users/infrastructure/collections";
import { EntryStatus } from "../../modules/auctions/domain/states";

async function main() {
  await connectMongo();
  const db = getMongoDb();

  const users = await usersCollection(db).find({}).toArray();
  for (const u of users) {
    if (u.balanceAvailable < 0 || u.balanceLocked < 0) {
      throw new Error(`Negative balance for user ${u._id.toHexString()}`);
    }
  }

  const auctions = await auctionsCollection(db).find({}).toArray();
  for (const a of auctions) {
    const won = await entriesCollection(db).countDocuments({ auctionId: a._id, status: "WON" as const });
    if (won !== a.itemsAwarded) {
      throw new Error(`Auction ${a._id.toHexString()} itemsAwarded mismatch: itemsAwarded=${a.itemsAwarded} but WON=${won}`);
    }
    if (a.itemsAwarded > a.totalItems) {
      throw new Error(`Auction ${a._id.toHexString()} awarded more than totalItems`);
    }
    if (a.status === "COMPLETED") {
      const active = await entriesCollection(db).countDocuments({ auctionId: a._id, status: EntryStatus.ACTIVE });
      if (active !== 0) {
        throw new Error(`Auction ${a._id.toHexString()} completed but has ACTIVE entries`);
      }
    }
  }

  console.log("OK: invariants valid");
  process.exit(0);
}

main().catch((e) => {
  console.error("Invariant check failed:", e);
  process.exit(1);
});
