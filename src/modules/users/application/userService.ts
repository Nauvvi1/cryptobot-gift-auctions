import { ObjectId, ClientSession } from "mongodb";
import { getMongoDb } from "../../../app/mongo";
import { config } from "../../../app/config";
import { assert } from "../../../common/errors";
import { usersCollection } from "../infrastructure/collections";

export async function createUser(name?: string) {
  const db = getMongoDb();
  const col = usersCollection(db);
  const doc = {
    _id: new ObjectId(),
    name,
    balanceAvailable: config.demoStartBalance,
    balanceLocked: 0,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function getUser(userId: string) {
  const db = getMongoDb();
  const col = usersCollection(db);
  const user = await col.findOne({ _id: new ObjectId(userId) });
  assert(user, "NOT_FOUND", "User not found", 404);
  return user;
}

export async function adjustBalancesTx(userId: ObjectId, deltaAvailable: number, deltaLocked: number, session: ClientSession) {
  const db = getMongoDb();
  const col = usersCollection(db);
  const updated = await col.findOneAndUpdate(
  { _id: userId, balanceAvailable: { $gte: -deltaAvailable } }, // prevent negative available
  { $inc: { balanceAvailable: deltaAvailable, balanceLocked: deltaLocked } },
  { session }
);
assert(updated, "BALANCE", "Insufficient available balance");
assert(updated.balanceAvailable >= 0 && updated.balanceLocked >= 0, "BALANCE", "Balance invariant violated");
return updated;
}
