import { assert } from "../../../common/errors";
import { AuctionDoc } from "./types";
import { AuctionStatus } from "./states";

export function assertAuctionMutable(a: AuctionDoc) {
  assert(a.status === AuctionStatus.DRAFT, "STATE", "Auction must be DRAFT for this operation");
}

export function assertAuctionLive(a: AuctionDoc) {
  assert(a.status === AuctionStatus.LIVE, "STATE", "Auction must be LIVE");
}
