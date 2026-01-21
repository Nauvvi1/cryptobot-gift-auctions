async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message || "Ошибка запроса";
    const code = data?.error?.code || "REQUEST_FAILED";
    const details = data?.error?.details;

    const err = new Error(msg);
    err.code = code;
    err.details = details;
    throw err;
  }

  return data;
}

function $(id) { return document.getElementById(id); }

function fmtDate(d) {
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function isHex24(s) {
  return /^[a-f0-9]{24}$/i.test(String(s || ""));
}

function showInline(preId, text) {
  setText(preId, text);
}

function clearInline(preId) {
  setText(preId, "");
}
