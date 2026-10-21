/**
 * Deteção de bots — versão melhorada do algoritmo da extensão ViewerMetrics.
 *
 * Correções face ao original:
 *  1. PONTO CEGO REMOVIDO — o original excluía as contas criadas nos últimos
 *     ~2 meses (BOT_DATE_RANGE_END = agora-1 mês e start=2020), por isso uma
 *     botnet criada este mês era invisível. Agora TODOS os meses são analisados.
 *  2. BASELINE ROBUSTA — o original usava a média após excluir o top-5; a média
 *     fica distorcida em caudas longas. Usamos a mediana dos meses restantes.
 *  3. CLUSTERS POR DIA — deteção extra de "rajadas" de contas criadas no mesmo
 *     dia, sinal clássico de criação em massa.
 *  4. Limiar absoluto mínimo (3) para não marcar picos falsos em chats pequenos.
 */

const TOP_MONTHS_TO_EXCLUDE = 5;
const BOT_GATE_PCT = 5; // original: 10 — com baseline robusta podemos descer
const MIN_SPIKE_COUNT = 3;

export interface MonthBucket {
  month: string; // YYYY-MM
  count: number;
  isSpike: boolean;
}

export interface DayCluster {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface BotAnalysis {
  totalAccounts: number;
  suspectedBots: number;
  botPercentage: number;
  legitimatePercentage: number;
  monthlyDistribution: MonthBucket[];
  baseline: number;
  spikeMonths: string[];
  dayClusters: DayCluster[];
  accountAgeStats: {
    avgDays: number;
    medianDays: number;
    under7Days: number;
    under30Days: number;
    under90Days: number;
    under1Year: number;
  };
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function analyzeBotPatterns(
  accountDates: { login: string; createdAt: string }[],
): BotAnalysis {
  const empty: BotAnalysis = {
    totalAccounts: 0,
    suspectedBots: 0,
    botPercentage: 0,
    legitimatePercentage: 100,
    monthlyDistribution: [],
    baseline: 0,
    spikeMonths: [],
    dayClusters: [],
    accountAgeStats: {
      avgDays: 0,
      medianDays: 0,
      under7Days: 0,
      under30Days: 0,
      under90Days: 0,
      under1Year: 0,
    },
  };
  if (accountDates.length === 0) return empty;

  const now = Date.now();
  const ages: number[] = [];
  let u7 = 0,
    u30 = 0,
    u90 = 0,
    u1y = 0;

  const monthCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();

  for (const acc of accountDates) {
    if (!acc.createdAt) continue;
    const t = new Date(acc.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const days = Math.floor((now - t) / 86400000);
    ages.push(days);
    if (days < 7) u7++;
    if (days < 30) u30++;
    if (days < 90) u90++;
    if (days < 365) u1y++;

    const iso = new Date(t).toISOString();
    const mk = iso.slice(0, 7);
    const dk = iso.slice(0, 10);
    monthCounts.set(mk, (monthCounts.get(mk) ?? 0) + 1);
    dayCounts.set(dk, (dayCounts.get(dk) ?? 0) + 1);
  }

  const totalValid = ages.length;
  const avgDays =
    totalValid > 0
      ? Math.round(ages.reduce((a, b) => a + b, 0) / totalValid)
      : 0;
  const medianDays = Math.round(median(ages));

  // ─── Baseline: excluir top-N meses, mediana do resto ───
  const entries = [...monthCounts.entries()];
  const byCountDesc = [...entries].sort((a, b) => b[1] - a[1]);
  const excluded = Math.min(TOP_MONTHS_TO_EXCLUDE, byCountDesc.length);
  const remaining = byCountDesc.slice(excluded).map(([, c]) => c);

  let baseline: number;
  if (remaining.length >= 2) {
    baseline = median(remaining);
  } else if (entries.length > 0) {
    // Poucos meses de dados — média global como fallback
    baseline = entries.reduce((a, [, c]) => a + c, 0) / entries.length;
  } else {
    baseline = 1;
  }
  baseline = Math.max(1, Math.round(baseline * 10) / 10);

  // ─── Spikes: meses claramente acima do baseline ───
  // Mediana robusta + margem (×1.5 e +2): evita marcar variância normal
  // de chats grandes como "pico" (só excessos relevantes contam).
  const spikeThreshold = Math.max(baseline * 1.5, baseline + 2);
  const spikeMonths: string[] = [];
  let suspectedBots = 0;
  for (const [month, count] of entries) {
    if (count > spikeThreshold && count >= MIN_SPIKE_COUNT) {
      spikeMonths.push(month);
      suspectedBots += Math.max(0, Math.round(count - baseline));
    }
  }

  // ─── Clusters por dia (top 8) ───
  const dayClusters: DayCluster[] = [...dayCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([date, count]) => ({ date, count }));

  const monthlyDistribution: MonthBucket[] = [...monthCounts.keys()]
    .sort()
    .map((month) => ({
      month,
      count: monthCounts.get(month) ?? 0,
      isSpike: spikeMonths.includes(month),
    }));

  // Gate anti falsos-positivos (como na extensão)
  const rawPct = totalValid > 0 ? (suspectedBots / totalValid) * 100 : 0;
  const show = rawPct >= BOT_GATE_PCT;

  return {
    totalAccounts: totalValid,
    suspectedBots: show ? suspectedBots : 0,
    botPercentage: show ? Math.round(rawPct * 10) / 10 : 0,
    legitimatePercentage: show
      ? Math.round((100 - rawPct) * 10) / 10
      : 100,
    monthlyDistribution,
    baseline,
    spikeMonths: show ? spikeMonths : [],
    dayClusters,
    accountAgeStats: {
      avgDays,
      medianDays,
      under7Days: u7,
      under30Days: u30,
      under90Days: u90,
      under1Year: u1y,
    },
  };
}

/** Verdadeiro se a conta foi criada num mês de pico. */
export function isSpikeMonthAccount(
  createdAt: string,
  spikeMonths: string[],
): boolean {
  if (!createdAt || spikeMonths.length === 0) return false;
  const key = new Date(createdAt).toISOString().slice(0, 7);
  return spikeMonths.includes(key);
}

// ─── Heurísticas por conta (0–100) ────────────

export interface HeuristicInput {
  login: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
  /** nº de viewers do chat criados exatamente no mesmo dia */
  sameDayCount?: number;
}

export interface HeuristicResult {
  score: number;
  reasons: string[];
  level: "bot" | "suspeito" | "ok";
}

const DEFAULT_AVATAR_PATTERNS = [
  "user-default-pictures",
  "user_typeimages",
  "default-profile-image",
  "xarth/404_user",
];

const BOT_USERNAME_PATTERNS: { re: RegExp; weight: number; reason: string }[] =
  [
    {
      re: /^[a-z]+_[a-z]+_\d{2,6}$/i,
      weight: 30,
      reason: "Nome no formato palavra_palavra_número (típico de bots gerados)",
    },
    {
      re: /^[a-z]+_\d{3,8}$/i,
      weight: 25,
      reason: "Nome no formato palavra_número (típico de bots gerados)",
    },
    {
      re: /^(user|viewer|guest|stream)[-_]?\d{3,}$/i,
      weight: 35,
      reason: "Nome genérico com números (user/viewer/guest + número)",
    },
    {
      re: /(?:[a-z]{2}\d{2}){2,}/i,
      weight: 25,
      reason: "Padrão letras+números repetido (ex: ab12cd34)",
    },
    { re: /^\d+$/, weight: 40, reason: "Nome composto apenas por números" },
    {
      re: /^[a-z]{8,}\d{4,}$/i,
      weight: 20,
      reason: "Sequência de letras seguida de muitos números",
    },
  ];

export function scoreViewerHeuristics(input: HeuristicInput): HeuristicResult {
  const reasons: string[] = [];
  let score = 0;

  const created = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  const ageDays = Number.isNaN(created)
    ? -1
    : Math.floor((Date.now() - created) / 86400000);

  // 1) Avatar padrão
  const hasDefaultAvatar = DEFAULT_AVATAR_PATTERNS.some((p) =>
    (input.profileImageURL || "").toLowerCase().includes(p),
  );
  if (hasDefaultAvatar) {
    score += ageDays >= 0 && ageDays < 90 ? 25 : 12;
    reasons.push("Avatar padrão da Twitch (nunca personalizado)");
  }

  // 2) Username típico de bot
  for (const p of BOT_USERNAME_PATTERNS) {
    if (p.re.test(input.login)) {
      score += p.weight;
      reasons.push(p.reason);
      break;
    }
  }

  // 3) Idade + seguidores
  if (ageDays >= 0) {
    if (ageDays < 7) {
      score += 20;
      reasons.push("Conta com menos de 7 dias");
    } else if (ageDays < 30) {
      score += 12;
      reasons.push("Conta com menos de 30 dias");
    }
    if (input.followers === 0 && ageDays < 90) {
      score += 10;
      reasons.push("0 seguidores numa conta recente");
    }
  }

  // 4) Cluster: várias contas do chat criadas no mesmo dia
  const sameDay = input.sameDayCount ?? 0;
  if (sameDay >= 5) {
    score += 25;
    reasons.push(`${sameDay} contas do chat criadas no mesmo dia (rajada)`);
  } else if (sameDay >= 3) {
    score += 15;
    reasons.push(`${sameDay} contas do chat criadas no mesmo dia`);
  }

  // 5) Redução: conta antiga, personalizada e com seguidores
  if (ageDays > 365 && input.followers > 0 && !hasDefaultAvatar) score -= 10;

  score = Math.max(0, Math.min(100, score));
  const level: HeuristicResult["level"] =
    score >= 60 ? "bot" : score >= 35 ? "suspeito" : "ok";
  return { score, reasons, level };
}
