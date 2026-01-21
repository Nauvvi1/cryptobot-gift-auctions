export type CreateAuctionDto = {
  title: string;
  totalItems: number;
  awardPerRound: number;
  roundDurationSec: number;
  antiSniping: { thresholdSec: number; extendSec: number; maxExtensions: number };
};

export type BidDto = {
  userId: string;
  amount: number;
};
