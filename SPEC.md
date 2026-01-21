# SPEC — Multi-round gift auction (Clean Version)

This spec is intentionally minimal and judge-friendly.
Where Telegram's exact behavior is unknown, assumptions are explicitly stated.

## Domain model

### Auction
```ts
Auction {
  _id
  title
  status: "DRAFT" | "LIVE" | "COMPLETED"
  totalItems: number
  awardPerRound: number
  roundDurationSec: number
  antiSniping: { thresholdSec: number, extendSec: number, maxExtensions: number }
  itemsAwarded: number                 // derived counter (no snapshots)
  currentRoundId?: ObjectId
  createdAt
}
```

### Round
```ts
Round {
  _id
  auctionId
  index: number
  status: "LIVE" | "FINISHING" | "FINISHED"
  startAt: Date
  endAt: Date
  extensions: number
}
```

### Entry
```ts
Entry {
  _id
  auctionId
  userId
  amount: number
  status: "ACTIVE" | "WON" | "LOST"
  lastBidAt: Date
  wonRoundIndex?: number
  wonAt?: Date
}
```

### User (minimal for balance display + correctness)
```ts
User {
  _id
  name?: string
  balanceAvailable: number
  balanceLocked: number
  createdAt
}
```

## Auction lifecycle (simple words)

- Auction starts in **DRAFT**
- `startAuction()` → creates Round #1, sets auction **LIVE**
- During a LIVE round:
  - user can bid (one entry per user per auction)
  - bid increases `Entry.amount`
  - delta is moved from `User.balanceAvailable` to `User.balanceLocked`

### Round settlement
At `round.endAt`:
1) take all ACTIVE entries for this auction
2) sort: `amount DESC`, then `lastBidAt ASC`
3) winners: top `min(awardPerRound, totalItems - itemsAwarded)`
4) mark those entries as **WON**
5) others remain **ACTIVE**
6) increase `itemsAwarded` by winners count
7) if `itemsAwarded < totalItems` → create next round (index+1)
8) else:
   - mark auction **COMPLETED**
   - remaining ACTIVE → **LOST**
   - refund: move all remaining locked funds back to available

### Anti-sniping (assumption)
If a bid is placed within the last `thresholdSec` seconds of the round:
- extend `Round.endAt` by `extendSec`
- increment `extensions`
- stop extending once `extensions == maxExtensions`

This is a clean, explainable variant of anti-sniping.

## Invariants
- User balances never negative
- Total (available + locked + spent) is conserved (spent is derived from winners' amounts)
- Each auction awards exactly `totalItems` winners
- A user has at most one ACTIVE/WON/LOST entry per auction (MVP constraint)

## Concurrency strategy
- `bid()` and `settleRound()` run in Mongo **transactions**
- Round settlement uses atomic transition:
  - `LIVE -> FINISHING` by `findOneAndUpdate`
  - only the winner of this transition performs settlement
