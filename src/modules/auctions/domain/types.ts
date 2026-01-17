import { ObjectId } from "mongodb";
import type { AuctionStatus, RoundStatus } from "./states";

export type Currency = string;

export type AntiSnipingCfg = {
  thresholdSec: number;
  extendSec: number;
  maxExtensions: number;
  hardDeadlineSec?: number;
};

export type RoundConfig = {
  defaultAwardCount: number;
  roundDurationSec: number;
  minBid: number;
  minIncrement: number;
  antiSniping: AntiSnipingCfg;
};

export type AuctionDoc = {
  _id: ObjectId;
  title: string;
  description?: string;
  status: AuctionStatus;
  roundConfig: RoundConfig;
  activeRoundId?: ObjectId;
  refundCursor?: { lastId?: string };
  createdAt: Date;
  updatedAt: Date;
};

export type RoundDoc = {
  _id: ObjectId;
  auctionId: ObjectId;
  index: number;
  status: RoundStatus;
  startAt: Date;
  endAt: Date;
  hardEndAt?: Date;
  extensionsCount: number;
  awardCount: number;
  minBid: number;
  minIncrement: number;
  antiSniping: AntiSnipingCfg;
  stats: {
    bidsCount: number;
    uniqueBidders: number;
    topBidAmount?: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type BidDoc = {
  _id: ObjectId;
  roundId: ObjectId;
  auctionId: ObjectId;
  userId: string;
  amountTotal: number;
  firstBidAt: Date;
  lastBidAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WalletDoc = {
  _id: ObjectId;
  userId: string;
  currency: Currency;
  available: number;
  reserved: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ParticipationDoc = {
  _id: ObjectId;
  userId: string;
  auctionId: ObjectId;
  currency: Currency;
  reserved: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LedgerType =
  | "DEPOSIT"
  | "BID_RESERVE"
  | "BID_SPEND"
  | "BID_REFUND"
  | "ADJUST";

export type LedgerEntryDoc = {
  _id: ObjectId;
  userId: string;
  currency: Currency;
  type: LedgerType;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  auctionId?: ObjectId;
  roundId?: ObjectId;
  bidId?: ObjectId;
  awardId?: string;
  idempotencyKey?: string;
  meta?: Record<string, any>;
  createdAt: Date;
};

export type ItemDoc = {
  _id: ObjectId;
  auctionId: ObjectId;
  name: string;
  metadata?: Record<string, any>;
  status: "AVAILABLE" | "AWARDED";
  awardedToUserId?: string;
  awardId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AwardDoc = {
  _id: string; // deterministic
  auctionId: ObjectId;
  roundId: ObjectId;
  roundIndex: number;
  userId: string;
  itemId: ObjectId;
  rank: number;
  serial: string;
  spendAmount: number;
  createdAt: Date;
};

export type OutboxDoc = {
  _id: ObjectId;
  seq: number;
  type: string;
  aggregate: "ROUND" | "AUCTION";
  aggregateId: ObjectId;
  auctionId?: ObjectId;
  roundId?: ObjectId;
  payload: any;
  status: "NEW" | "PUBLISHED";
  createdAt: Date;
  publishedAt?: Date;
};

export type ReceiptDoc = {
  _id: ObjectId;
  idempotencyKey: string;
  userId: string;
  roundId: ObjectId;
  response: any;
  createdAt: Date;
};

export type CounterDoc = {
  _id: string;
  value: number;
};
