const api = {
  async req(path, opts = {}) {
    const userId = localStorage.getItem("userId") || "demo_user_1";

    let body = opts.body;
    const headers = {
      "X-User-Id": userId,
      ...(opts.headers || {}),
    };

    if (body != null && typeof body === "object") {
      body = JSON.stringify(body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    } else if (typeof body === "string") {
      const s = body.trim();
      if ((s.startsWith("{") || s.startsWith("[")) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    const res = await fetch(path, { ...opts, body, headers });
    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text ? { raw: text } : null;
    }

    if (!res.ok) {
      const msg = (data && data.message) ? data.message : ("HTTP " + res.status);
      throw Object.assign(new Error(msg), { status: res.status, data });
    }

    return data;
  },
};

function fmtTs(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function initUserPicker() {
  const userSel = document.getElementById("user");
  const saveBtn = document.getElementById("saveUser");
  if (!userSel || !saveBtn) return;

  userSel.value = localStorage.getItem("userId") || "demo_user_1";

  saveBtn.onclick = () => {
    localStorage.setItem("userId", userSel.value);
    // simplest UX: reload to reconnect SSE with new userId
    location.reload();
  };
}

function humanizeError(e) {
  const d = e && e.data ? e.data : null;
  if (!d) return e.message || "Ошибка";

  // Validation error
  if (d.code === "VALIDATION_ERROR") {
    const fe = d.details && d.details.fieldErrors ? d.details.fieldErrors : {};
    const parts = [];
    for (const k of Object.keys(fe)) {
      parts.push(`${k}: ${Array.isArray(fe[k]) ? fe[k].join(", ") : String(fe[k])}`);
    }
    return parts.length ? `Некорректный запрос: ${parts.join(" | ")}` : "Некорректный запрос";
  }

  // Bid errors
  if (d.code === "BID_TOO_LOW") {
    const det = d.details || {};
    if (det.reason === "MIN_BID") {
      return `Ставка слишком маленькая. Минимальная ставка: ${det.minBid}.`;
    }
    if (det.reason === "MIN_INCREMENT") {
      return `Нужно увеличить минимум на ${det.minIncrement}. Минимально допустимая сумма: ${det.requiredMinTotal}.`;
    }
    if (det.reason === "NON_INCREASING") {
      return `Ставка должна быть больше текущей. Минимально: ${det.requiredMinTotal}.`;
    }
    return "Ставка отклонена: слишком маленькая.";
  }

  if (d.code === "INSUFFICIENT_FUNDS") {
    const det = d.details || {};
    if (typeof det.available === "number" && typeof det.requiredDelta === "number") {
      return `Недостаточно средств. Доступно: ${det.available}, нужно добавить: ${det.requiredDelta}.`;
    }
    return "Недостаточно средств.";
  }

  if (d.code === "ROUND_NOT_LIVE") {
    return "Раунд сейчас не принимает ставки (не запущен или уже завершён).";
  }

  if (d.code === "BID_CONFLICT") {
    return "Конкурентная ставка. Обновите страницу и попробуйте ещё раз.";
  }

  if (d.code === "IDEMPOTENCY_RETRY") {
    return "Система обрабатывает повтор запроса. Повторите ставку с новым ключом.";
  }

  return d.message || e.message || "Ошибка";
}

function getSuggestedAmountFromError(e) {
  const d = e && e.data ? e.data : null;
  if (!d || !d.details) return null;
  if (d.code === "BID_TOO_LOW") {
    const det = d.details;
    if (typeof det.requiredMinTotal === "number") return det.requiredMinTotal;
    if (typeof det.minBid === "number") return det.minBid;
  }
  return null;
}

async function renderWallet() {
  const el = document.getElementById("wallet");
  if (!el) return;
  const w = await api.req("/api/me/wallet");
  el.innerHTML = `
    <div class="badge">available: ${w.available}</div>
    <div class="badge">reserved: ${w.reserved}</div>
    <div class="badge">currency: ${w.currency}</div>
    <div style="margin-top:6px">
      <a href="/profile.html">Открыть профиль</a>
    </div>
  `;
}

async function home() {
  initUserPicker();

  const depositBtn = document.getElementById("deposit");
  if (depositBtn) {
    depositBtn.onclick = async () => {
      try {
        const userId = localStorage.getItem("userId") || "demo_user_1";
        await api.req(`/admin/users/${encodeURIComponent(userId)}/deposit`, {
          method: "POST",
          body: { amount: 100000 },
        });
        await renderWallet();
        alert("Баланс пополнен");
      } catch (e) {
        console.error(e);
        alert(`Не удалось пополнить баланс: ${humanizeError(e)}`);
      }
    };
  }

  const adminStatus = document.getElementById("adminStatus");
  let lastAuctionId = null;

  function logAdmin(msg, obj) {
    if (!adminStatus) return;
    const head = msg ? `${msg}\n` : "";
    adminStatus.textContent = head + (obj ? JSON.stringify(obj, null, 2) : "");
  }

  const adminCreate = document.getElementById("adminCreate");
  const adminSeed = document.getElementById("adminSeed");
  const adminStart = document.getElementById("adminStart");
  const demoFast = document.getElementById("demoFast");

  // Fast demo: finishes in ~20-40 seconds + refund phase
  if (demoFast) demoFast.onclick = async () => {
    try {
      logAdmin("Запускаю быстрый демо-сценарий...", null);

      // 1) deposit a few demo users to make bidding easier
      const demoUsers = ["demo_user_1", "demo_user_2", "demo_user_3"];
      for (const u of demoUsers) {
        await api.req(`/admin/users/${encodeURIComponent(u)}/deposit`, {
          method: "POST",
          body: { amount: 200000 },
          headers: { "X-User-Id": "demo_user_1" }, // admin from any demo user
        });
      }

      // 2) create auction
      const payload = {
        title: "FAST DEMO — Gift Drop",
        roundConfig: {
          defaultAwardCount: 5,
          roundDurationSec: 12,
          minBid: 10,
          minIncrement: 2,
          antiSniping: { thresholdSec: 5, extendSec: 5, maxExtensions: 2, hardDeadlineSec: 40 },
        },
      };

      const created = await api.req("/admin/auctions", { method: "POST", body: payload });
      lastAuctionId = created.auctionId;
      logAdmin(`Создан аукцион ${lastAuctionId}`, created);

      // 3) seed a small amount (2 rounds)
      const seeded = await api.req(`/admin/auctions/${lastAuctionId}/items/seed`, {
        method: "POST",
        body: { count: 10, namePrefix: "Gift" },
      });
      logAdmin("Предметы добавлены", seeded);

      // 4) start
      const started = await api.req(`/admin/auctions/${lastAuctionId}/start`, {
        method: "POST",
        body: { firstRoundAwardCount: 5 },
      });
      logAdmin("Аукцион запущен", started);

      await loadAuctions();
      alert("Быстрый демо-аукцион создан. Открой его из списка ниже.");
    } catch (e) {
      console.error(e);
      logAdmin("Ошибка fast demo", e.data || { message: e.message });
      alert(`Fast demo failed: ${humanizeError(e)}`);
    }
  };

  if (adminCreate) adminCreate.onclick = async () => {
    try {
      const payload = {
        title: "Rare Gift Drop #1",
        roundConfig: {
          defaultAwardCount: 25,
          roundDurationSec: 60,
          minBid: 50,
          minIncrement: 10,
          antiSniping: { thresholdSec: 10, extendSec: 10, maxExtensions: 10, hardDeadlineSec: 180 },
        },
      };

      const r = await api.req("/admin/auctions", { method: "POST", body: payload });
      lastAuctionId = r.auctionId || null;
      logAdmin(`Создан аукцион ${lastAuctionId}`, r);

      await loadAuctions();
    } catch (e) {
      console.error(e);
      logAdmin("Ошибка create auction", e.data || { message: e.message });
      alert(`Create auction failed: ${humanizeError(e)}`);
    }
  };

  if (adminSeed) adminSeed.onclick = async () => {
    try {
      if (!lastAuctionId) return alert("Сначала создайте аукцион");
      const r = await api.req(`/admin/auctions/${lastAuctionId}/items/seed`, {
        method: "POST",
        body: { count: 500, namePrefix: "Gift" },
      });
      logAdmin("Предметы добавлены", r);
      await loadAuctions();
    } catch (e) {
      console.error(e);
      logAdmin("Ошибка seed", e.data || { message: e.message });
      alert(`Seed failed: ${humanizeError(e)}`);
    }
  };

  if (adminStart) adminStart.onclick = async () => {
    try {
      if (!lastAuctionId) return alert("Сначала создайте аукцион");
      const r = await api.req(`/admin/auctions/${lastAuctionId}/start`, {
        method: "POST",
        body: { firstRoundAwardCount: 25 },
      });
      logAdmin("Аукцион запущен", r);
      await loadAuctions();
    } catch (e) {
      console.error(e);
      logAdmin("Ошибка start", e.data || { message: e.message });
      alert(`Start failed: ${humanizeError(e)}`);
    }
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
  initUserPicker();

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
      <div class="hint" style="margin-top:6px">
        Совет: чтобы проверить anti-sniping — сделай ставку в последние ~5 секунд до end.
      </div>
    ` : `<small>No round</small>`;

    topEl.innerHTML = `
      <table>
        <thead><tr><th>rank</th><th>user</th><th>amount</th><th>lastBidAt</th></tr></thead>
        <tbody>
          ${(data.top || []).map((x, i) =>
            `<tr><td>${i+1}</td><td>${x.userId}</td><td>${x.amountTotal}</td><td>${x.lastBidAt ? fmtTs(x.lastBidAt) : ""}</td></tr>`
          ).join("")}
        </tbody>
      </table>
    `;
  }

  function appendEvent(e) {
    if (!eventsEl) return;
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
      if (!currentRoundId) return alert("Нет активного раунда");

      const amountTotal = Number(amountEl.value);
      if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
        return alert("Введите сумму ставки (число > 0)");
      }

      const key = crypto.randomUUID();

      const r = await api.req(`/api/rounds/${currentRoundId}/bid`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: { amountTotal },
      });

      bidRes.textContent = JSON.stringify(r, null, 2);
      await refresh();
    } catch (e) {
      console.error(e);

      const msg = humanizeError(e);
      const suggested = getSuggestedAmountFromError(e);

      bidRes.textContent = JSON.stringify(e.data || { message: e.message }, null, 2);

      if (suggested != null && amountEl) {
        amountEl.value = String(suggested);
        alert(`${msg}\n\nЯ уже подставил минимально допустимую сумму: ${suggested}`);
      } else {
        alert(msg);
      }
    }
  };

  await refresh();
  connectSSE();
  setInterval(refresh, 2000);
}

async function profilePage() {
  initUserPicker();

  const wEl = document.getElementById("wallet");
  if (!wEl) return;

  await renderWallet();

  const bids = await api.req("/api/me/bids");
  document.getElementById("myBids").innerHTML = `
    <table><thead><tr><th>auction</th><th>round</th><th>amount</th><th>lastBidAt</th></tr></thead>
    <tbody>${bids.items.map(b =>
      `<tr><td>${b.auctionId}</td><td>#${b.roundIndex}</td><td>${b.amountTotal}</td><td>${b.lastBidAt ? fmtTs(b.lastBidAt) : ""}</td></tr>`
    ).join("")}</tbody>
    </table>
  `;

  const awards = await api.req("/api/me/awards");
  document.getElementById("myAwards").innerHTML = `
    <table><thead><tr><th>auction</th><th>round</th><th>rank</th><th>serial</th><th>item</th></tr></thead>
    <tbody>${awards.items.map(a =>
      `<tr><td>${a.auctionId}</td><td>#${a.roundIndex}</td><td>${a.rank}</td><td>${a.serial}</td><td>${a.itemId}</td></tr>`
    ).join("")}</tbody>
    </table>
  `;
}

(async function () {
  if (location.pathname === "/" || location.pathname.endsWith("/index.html")) return home();
  if (location.pathname.endsWith("/auction.html")) return auctionPage();
  if (location.pathname.endsWith("/profile.html")) return profilePage();
})();
