import type { Response } from "express";

type Client = { res: Response; auctionId?: string; roundId?: string; userId?: string; afterSeq: number };

export class SSEHub {
  private clients = new Set<Client>();

  add(res: Response, client: Omit<Client, "res">) {
    const c: Client = { ...client, res };
    this.clients.add(c);

    res.on("close", () => {
      this.clients.delete(c);
    });
  }

  publish(event: any) {
    for (const c of this.clients) {
      if (event.seq != null && event.seq <= c.afterSeq) continue;
      if (c.auctionId && event.auctionId !== c.auctionId) continue;
      if (c.roundId && event.roundId !== c.roundId) continue;

      c.res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}

export const sseHub = new SSEHub();
