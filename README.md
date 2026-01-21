# Gift Auctions Platform (Clean Version)

Minimal, readable implementation of a multi-round auction mechanic (inspired by Telegram Gift Auctions), focused on:
- **one clear auction flow**
- **correct concurrency under load**
- **transparent domain model**
- **simple UI** for judges (no "magic", no hidden modes)

## What you get
- Node.js + TypeScript + MongoDB (replica set for transactions)
- Multi-round auction:
  - entries bid during a round
  - at round end: top `awardPerRound` are marked **WON**
  - others remain **ACTIVE** and continue to next round
  - when `totalItems` are exhausted → auction **COMPLETED** and remaining ACTIVE become **LOST**
- Anti-sniping extension:
  - if a bid is placed within `thresholdSec` of `round.endAt`, round end is extended by `extendSec`
  - limited by `maxExtensions`
- SSE events stream for live UI updates
- One-button demo load (50 bots)

## Run locally (Docker)
```bash
cp .env.example .env
docker compose up --build
```

Open:
- UI: http://localhost:8080
- API health: http://localhost:8080/api/health

## Quick demo script
1) Open UI http://localhost:8080
2) Create a user with initial balance
3) Create an auction (DRAFT), then start it
4) Open auction page, place bids
5) Click **Start demo load (50 bots)**

## Key endpoints (short)
- `POST /api/users` create user (name optional)
- `GET /api/users/:id` get user & balance
- `POST /api/auctions` create auction
- `POST /api/auctions/:id/start` start (creates round #1)
- `POST /api/auctions/:id/bid` place/increase bid for user (one entry per user per auction)
- `POST /api/auctions/:id/demo-bots` start 50 demo bots
- `GET /api/auctions/:id` auction state
- `GET /api/auctions/:id/round` current round
- `GET /api/auctions/:id/top` top entries for current round
- `GET /api/auctions/:id/events` SSE stream

## Design notes (why it’s stable)
- All money movements are performed inside MongoDB **transactions**
- Every bid uses **delta locking** (available -> locked), no double-charging
- Round settlement is protected by an atomic **status transition**: LIVE -> FINISHING -> FINISHED
- A scheduler worker finalizes rounds based on `endAt`

More details: see **SPEC.md**.


## UI
- Интерфейс на русском
- Подписанные параметры создания аукциона (включая anti-sniping)
- Настройка демо-ботов (количество и интервал)
- Модалка с победителями по раундам после завершения аукциона
