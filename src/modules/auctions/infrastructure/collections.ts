import type { Db } from "mongodb";
import type {
  AuctionDoc,
  RoundDoc,
  BidDoc,
  WalletDoc,
  ParticipationDoc,
  LedgerEntryDoc,
  ItemDoc,
  AwardDoc,
  OutboxDoc,
  ReceiptDoc,
  CounterDoc,
} from "../domain/types";

export function colls(db: Db) {
  return {
    auctions: db.collection<AuctionDoc>("auctions"),
    rounds: db.collection<RoundDoc>("rounds"),
    bids: db.collection<BidDoc>("bids"),
    wallets: db.collection<WalletDoc>("wallets"),
    participations: db.collection<ParticipationDoc>("participations"),
    ledger: db.collection<LedgerEntryDoc>("ledger_entries"),
    items: db.collection<ItemDoc>("items"),
    awards: db.collection<AwardDoc>("awards"),
    outbox: db.collection<OutboxDoc>("outbox_events"),
    receipts: db.collection<ReceiptDoc>("idempotency_receipts"),
    counters: db.collection<CounterDoc>("counters"),
    eventsView: db.collection("outbox_events"), // alias for queries
  } as const;
}

export type Colls = ReturnType<typeof colls>;
