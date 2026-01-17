export const AuctionStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  COMPLETING_REFUNDS: "COMPLETING_REFUNDS",
  CANCELING_REFUNDS: "CANCELING_REFUNDS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type AuctionStatus = (typeof AuctionStatus)[keyof typeof AuctionStatus];

export const RoundStatus = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  LOCKED: "LOCKED",
  SETTLING: "SETTLING",
  FINISHED: "FINISHED",
} as const;

export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];
