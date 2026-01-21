import { Db, Collection } from "mongodb";
import { UserDoc } from "../domain/types";

export function usersCollection(db: Db): Collection<UserDoc> {
  return db.collection<UserDoc>("users");
}
