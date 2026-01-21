import { sleep } from "../../../common/async";
import { getAuction, getCurrentRound } from "./queries";
import { placeBid } from "./bidService";
import { createUser } from "../../users/application/userService";
import { events } from "./eventsService";

type BotHandle = { stop: () => void };
const running = new Map<string, BotHandle>();

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function startDemoBots(auctionId: string, opts?: { count?: number; intervalMinMs?: number; intervalMaxMs?: number }) {
  const count = opts?.count ?? 50;
  const intervalMinMs = opts?.intervalMinMs ?? 700;
  const intervalMaxMs = opts?.intervalMaxMs ?? 1200;

  if (running.has(auctionId)) return { ok: true, alreadyRunning: true };

  let stopped = false;
  const stop = () => { stopped = true; };
  running.set(auctionId, { stop });

  const bots = await Promise.all(
    Array.from({ length: count }).map(async (_, i) => createUser(`бот_${i + 1}`))
  );

  const current = new Map<string, number>();
  for (const b of bots) current.set(b._id.toHexString(), rand(5, 15));

  events.log(auctionId, { msg: `Демо-боты запущены: ${count} (интервал ${intervalMinMs}–${intervalMaxMs} мс)` });

  (async () => {
    while (!stopped) {
      const auction = await getAuction(auctionId);
      if (auction.status !== "LIVE") break;

      const round = await getCurrentRound(auctionId);
      const now = Date.now();
      const end = round.endAt.getTime();
      const msLeft = end - now;

      if (msLeft <= 3000) {
        await sleep(200);
        continue;
      }

      const bot = bots[rand(0, bots.length - 1)];
      const botId = bot._id.toHexString();

      const prev = current.get(botId) ?? 0;
      const inc = rand(1, 8);
      const next = prev + inc;
      current.set(botId, next);

      try {
        await placeBid({ auctionId, userId: botId, amount: next });
      } catch {
        // ignore
      }

      await sleep(rand(intervalMinMs, intervalMaxMs));
    }

    events.log(auctionId, { msg: "Демо-боты остановлены" });
    running.delete(auctionId);
  })().catch(() => {
    running.delete(auctionId);
  });

  return { ok: true };
}

export function stopDemoBots(auctionId: string) {
  running.get(auctionId)?.stop();
  running.delete(auctionId);
}
