import { sseBroadcast } from "../realtime/sseHub";

export const events = {
  auctionUpdated: (auctionId: string, payload: unknown) => sseBroadcast(auctionId, "auction", payload),
  roundUpdated: (auctionId: string, payload: unknown) => sseBroadcast(auctionId, "round", payload),
  topUpdated: (auctionId: string, payload: unknown) => sseBroadcast(auctionId, "top", payload),
  log: (auctionId: string, payload: unknown) => sseBroadcast(auctionId, "log", payload),
};
