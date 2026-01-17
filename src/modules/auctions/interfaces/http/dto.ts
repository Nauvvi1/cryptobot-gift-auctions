import { z } from "zod";

export const CreateAuctionDto = z.object({
  title: z.string().min(1),
  roundConfig: z.object({
    defaultAwardCount: z.number().int().min(1),
    roundDurationSec: z.number().int().min(5),
    minBid: z.number().min(0),
    minIncrement: z.number().int().min(1),
    antiSniping: z.object({
      thresholdSec: z.number().int().min(0),
      extendSec: z.number().int().min(0),
      maxExtensions: z.number().int().min(0),
      hardDeadlineSec: z.number().int().min(0).optional(),
    }),
  }),
});

export const SeedItemsDto = z.object({
  count: z.number().int().min(1).max(20000),
  namePrefix: z.string().min(1),
});

export const StartAuctionDto = z.object({
  firstRoundAwardCount: z.number().int().min(1).optional(),
});

export const PlaceBidDto = z.object({
  amountTotal: z.number().min(0),
});

export const DepositDto = z.object({
  amount: z.number().int().min(1),
});
