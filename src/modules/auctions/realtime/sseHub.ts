import { Response } from "express";
import { rid } from "../../../common/ids";

type Client = { id: string; res: Response; auctionId: string };

const clients: Client[] = [];

export function sseAddClient(res: Response, auctionId: string) {
  const id = rid("sse");
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`event: hello
data: ${JSON.stringify({ ok: true, id })}

`);
  const client: Client = { id, res, auctionId };
  clients.push(client);

  const close = () => {
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) clients.splice(idx, 1);
  };
  res.on("close", close);
  res.on("error", close);

  return id;
}

export function sseBroadcast(auctionId: string, event: string, payload: unknown) {
  const data = `event: ${event}
data: ${JSON.stringify(payload)}

`;
  for (const c of clients) {
    if (c.auctionId !== auctionId) continue;
    try { c.res.write(data); } catch { /* ignore */ }
  }
}
