// Seed real: replica o fluxo do cliente para alguns canais e grava scans na DB.
const BASE = "http://localhost:3000";

async function j(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

function analyze(accountDates) {
  const monthCounts = new Map();
  for (const a of accountDates) {
    if (!a.createdAt) continue;
    const key = new Date(a.createdAt).toISOString().slice(0, 7);
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }
  const entries = [...monthCounts.entries()];
  const desc = [...entries].sort((a, b) => b[1] - a[1]);
  const rem = desc.slice(Math.min(5, desc.length)).map(([, c]) => c);
  const med = (n) => {
    if (!n.length) return 0;
    const s = [...n].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  let baseline =
    rem.length >= 2
      ? med(rem)
      : entries.length
        ? entries.reduce((a, [, c]) => a + c, 0) / entries.length
        : 1;
  baseline = Math.max(1, Math.round(baseline * 10) / 10);
  const threshold = Math.max(baseline * 1.5, baseline + 2);
  const spikes = [];
  let bots = 0;
  for (const [m, c] of entries)
    if (c > threshold && c >= 3) {
      spikes.push(m);
      bots += Math.max(0, Math.round(c - baseline));
    }
  const total = accountDates.filter((a) => a.createdAt).length;
  const pct = total ? (bots / total) * 100 : 0;
  const show = pct >= 5;
  return {
    baseline,
    spikeMonths: show ? spikes : [],
    suspectedBots: show ? bots : 0,
    botPercentage: show ? Math.round(pct * 10) / 10 : 0,
    total,
  };
}

const channels = process.argv[2]
  ? [process.argv[2]]
  : ["gaules", "nish_party", "impaKt", "ricaf_", "lacy"];

for (const ch of channels) {
  try {
    const [chat, info] = await Promise.all([
      j(`${BASE}/api/twitch/chatters/${ch}`),
      j(`${BASE}/api/twitch/channel/${ch}`),
    ]);
    let users = [];
    if (chat.viewers.length) {
      const r = await j(`${BASE}/api/twitch/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logins: chat.viewers.slice(0, 600) }),
      });
      users = r.users;
    }
    const a = analyze(users);
    const res = await j(`${BASE}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: ch.toLowerCase(),
        displayName: info?.displayName ?? ch,
        avatarUrl: info?.profileImageURL ?? "",
        isLive: Boolean(info?.stream),
        streamViewers: chat.streamViewers,
        trackedViewers: chat.viewers.length,
        authenticatedUsers: a.total,
        suspectedBots: a.suspectedBots,
        botPercentage: a.botPercentage,
        baseline: a.baseline,
        spikeMonths: a.spikeMonths,
      }),
    });
    console.log(
      `OK ${ch}: ${chat.viewers.length} viewers, ${a.total} com datas, bots=${a.suspectedBots} (${a.botPercentage}%), spikes=${a.spikeMonths.length}`,
      res.ok ? "-> guardado" : JSON.stringify(res),
    );
  } catch (e) {
    console.log(`FALHOU ${ch}: ${e.message}`);
  }
}
