import { ObjectId } from "mongodb";

export type UserDoc = {
  _id: ObjectId;
  name?: string;
  balanceAvailable: number;
  balanceLocked: number;
  createdAt: Date;
};
