import { ObjectId } from "mongodb";
import { AuctionStatusT, EntryStatusT, RoundStatusT } from "./states";

export type AntiSniping = {
  thresholdSec: number;
  extendSec: number;
  maxExtensions: number;
};

export type AuctionDoc = {
  _id: ObjectId;
  title: string;
  status: AuctionStatusT;
  totalItems: number;
  awardPerRound: number;
  roundDurationSec: number;
  antiSniping: AntiSniping;
  itemsAwarded: number;
  currentRoundId?: ObjectId;
  createdAt: Date;
};

export type RoundDoc = {
  _id: ObjectId;
  auctionId: ObjectId;
  index: number;
  status: RoundStatusT;
  startAt: Date;
  endAt: Date;
  extensions: number;
};

export type EntryDoc = {
  _id: ObjectId;
  auctionId: ObjectId;
  userId: ObjectId;
  amount: number;
  status: EntryStatusT;
  lastBidAt: Date;
  wonRoundIndex?: number;
  wonAt?: Date;
};
