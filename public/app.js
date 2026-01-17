const api = {
  async req(path, opts = {}) {
    const userId = localStorage.getItem("userId") || "demo_user_1";
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
        ...(opts.headers || {})
      }
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { status: res.status, data });
    return data;
  }
};

function fmtTs(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

async function renderWallet() {
  const el = document.getElementById("wallet");
  if (!el) return;
  const w = await api.req("/api/me/wallet");
  el.innerHTML = `
    <div class="badge">available: ${w.available}</div>
    <div class="badge">reserved: ${w.reserved}</div>
    <div class="badge">currency: ${w.currency}</div>
  `;
}

async function home() {
  const userSel = document.getElementById("user");
  const saveBtn = document.getElementById("saveUser");
  if (userSel && saveBtn) {
    userSel.value = localStorage.getItem("userId") || "demo_user_1";
    saveBtn.onclick = () => {
      localStorage.setItem("userId", userSel.value);
      location.reload();
    };
  }

  const depositBtn = document.getElementById("deposit");
  if (depositBtn) {
    depositBtn.onclick = async () => {
      const userId = localStorage.getItem("userId") || "demo_user_1";
      await api.req(`/admin/users/${encodeURIComponent(userId)}/deposit`, {
        method: "POST",
        body: JSON.stringify({ amount: 100000 })
      });
      await renderWallet();
      alert("Deposited");
    };
  }

  const adminStatus = document.getElementById("adminStatus");
  let lastAuctionId = null;

  const adminCreate = document.getElementById("adminCreate");
  const adminSeed = document.getElementById("adminSeed");
  const adminStart = document.getElementById("adminStart");

  if (adminCreate) adminCreate.onclick = async () => {
    const payload = {
      title: "Rare Gift Drop #1",
      roundConfig: {
        defaultAwardCount: 25,
        roundDurationSec: 60,
        minBid: 50,
        minIncrement: 10,
        antiSniping: { thresholdSec: 10, extendSec: 10, maxExtensions: 10, hardDeadlineSec: 180 }
      }
    };
    const r = await api.req("/admin/auctions", { method: "POST", body: JSON.stringify(payload) });
    lastAuctionId = r.auctionId;
    adminStatus.textContent = `created auction ${lastAuctionId}\n` + JSON.stringify(r, null, 2);
    await loadAuctions();
  };

  if (adminSeed) adminSeed.onclick = async () => {
    if (!lastAuctionId) return alert("Create auction first");
    const r = await api.req(`/admin/auctions/${lastAuctionId}/items/seed`, {
      method: "POST",
      body: JSON.stringify({ count: 500, namePrefix: "Gift" })
    });
    adminStatus.textContent = `seeded items\n` + JSON.stringify(r, null, 2);
    await loadAuctions();
  };

  if (adminStart) adminStart.onclick = async () => {
    if (!lastAuctionId) return alert("Create auction first");
    const r = await api.req(`/admin/auctions/${lastAuctionId}/start`, {
      method: "POST",
      body: JSON.stringify({ firstRoundAwardCount: 25 })
    });
    adminStatus.textContent = `started\n` + JSON.stringify(r, null, 2);
    await loadAuctions();
  };

  async function loadAuctions() {
    const el = document.getElementById("auctions");
    if (!el) return;
    const data = await api.req("/api/auctions");
    el.innerHTML = data.items.map(a => `
      <div class="card">
        <div><b>${a.title}</b> <span class="badge">${a.status}</span></div>
        ${a.activeRound ? `
          <div><small>Round #${a.activeRound.index} ${a.activeRound.status} ends: ${fmtTs(a.activeRound.endAt)}</small></div>
          <div><a href="/auction.html?id=${a.id}">Open auction</a></div>
        ` : `<div><small>No active round</small></div>`}
      </div>
    `).join("");
  }

  await renderWallet();
  await loadAuctions();
}

async function auctionPage() {
  const url = new URL(location.href);
  const id = url.searchParams.get("id");
  if (!id) return;

  const titleEl = document.getElementById("title");
  const roundInfo = document.getElementById("roundInfo");
  const topEl = document.getElementById("top");
  const eventsEl = document.getElementById("events");
  const bidRes = document.getElementById("bidRes");
  const bidBtn = document.getElementById("bidBtn");
  const amountEl = document.getElementById("amount");

  let currentRoundId = null;
  let lastSeq = 0;

  async function refresh() {
    const data = await api.req(`/api/auctions/${id}`);
    titleEl.textContent = data.auction.title;

    const r = data.round;
    currentRoundId = r?.id || null;

    roundInfo.innerHTML = r ? `
      <div class="badge">#${r.index}</div>
      <div class="badge">${r.status}</div>
      <div class="badge">awardCount: ${r.awardCount}</div>
      <div class="badge">extensions: ${r.extensionsCount}</div>
      <div><small>start: ${fmtTs(r.startAt)}<br/>end: ${fmtTs(r.endAt)}</small></div>
    ` : `<small>No round</small>`;

    topEl.innerHTML = `
      <table>
        <thead><tr><th>rank</th><th>user</th><th>amount</th><th>lastBidAt</th></tr></thead>
        <tbody>
          ${(data.top || []).map((x, i) => `<tr><td>${i+1}</td><td>${x.userId}</td><td>${x.amountTotal}</td><td>${x.lastBidAt ? fmtTs(x.lastBidAt) : ""}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function appendEvent(e) {
    eventsEl.textContent =
      `[${e.seq}] ${e.type} ${e.aggregateId || ""} ${e.roundId || ""} ${e.userId || ""} ${e.amountTotal || ""}\n` +
      eventsEl.textContent;
  }

  function connectSSE() {
    const userId = localStorage.getItem("userId") || "demo_user_1";
    const sse = new EventSource(`/sse?auctionId=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}&afterSeq=${lastSeq}`);
    sse.onmessage = (msg) => {
      const e = JSON.parse(msg.data);
      lastSeq = Math.max(lastSeq, e.seq || 0);
      if (e.auctionId === id || e.aggregateId === id || e.roundId === currentRoundId) {
        appendEvent(e);
        refresh();
      }
    };
    sse.onerror = () => {
      sse.close();
      setTimeout(connectSSE, 600);
    };
  }

  if (bidBtn) bidBtn.onclick = async () => {
    try {
      const amountTotal = Number(amountEl.value);
      const key = crypto.randomUUID();
      const r = await api.req(`/api/rounds/${currentRoundId}/bid`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ amountTotal })
      });
      bidRes.textContent = JSON.stringify(r, null, 2);
      await refresh();
    } catch (e) {
      bidRes.textContent = JSON.stringify(e.data || { message: e.message }, null, 2);
    }
  };

  await refresh();
  connectSSE();
  setInterval(refresh, 2000);
}

async function profilePage() {
  const wEl = document.getElementById("wallet");
  if (!wEl) return;

  await renderWallet();

  const bids = await api.req("/api/me/bids");
  document.getElementById("myBids").innerHTML = `
    <table><thead><tr><th>auction</th><th>round</th><th>amount</th><th>lastBidAt</th></tr></thead>
    <tbody>${bids.items.map(b => `<tr><td>${b.auctionId}</td><td>#${b.roundIndex}</td><td>${b.amountTotal}</td><td>${b.lastBidAt ? fmtTs(b.lastBidAt) : ""}</td></tr>`).join("")}</tbody>
    </table>
  `;

  const awards = await api.req("/api/me/awards");
  document.getElementById("myAwards").innerHTML = `
    <table><thead><tr><th>auction</th><th>round</th><th>rank</th><th>serial</th><th>item</th></tr></thead>
    <tbody>${awards.items.map(a => `<tr><td>${a.auctionId}</td><td>#${a.roundIndex}</td><td>${a.rank}</td><td>${a.serial}</td><td>${a.itemId}</td></tr>`).join("")}</tbody>
    </table>
  `;
}

(async function () {
  if (location.pathname === "/" || location.pathname.endsWith("/index.html")) return home();
  if (location.pathname.endsWith("/auction.html")) return auctionPage();
  if (location.pathname.endsWith("/profile.html")) return profilePage();
})();
