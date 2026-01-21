export const AuctionStatus = {
  DRAFT: "DRAFT",
  LIVE: "LIVE",
  COMPLETED: "COMPLETED",
} as const;

export const RoundStatus = {
  LIVE: "LIVE",
  FINISHING: "FINISHING",
  FINISHED: "FINISHED",
} as const;

export const EntryStatus = {
  ACTIVE: "ACTIVE",
  WON: "WON",
  LOST: "LOST",
} as const;

export type AuctionStatusT = typeof AuctionStatus[keyof typeof AuctionStatus];
export type RoundStatusT = typeof RoundStatus[keyof typeof RoundStatus];
export type EntryStatusT = typeof EntryStatus[keyof typeof EntryStatus];
