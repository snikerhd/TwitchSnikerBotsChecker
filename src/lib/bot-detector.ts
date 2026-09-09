// Bot detection — exact replication of ViewerMetrics extension algorithm
// Source: enhanced-data-manager.js → detectBots(), calculateBaselineStats(), calculateMaxExpectedAccounts()

const BOT_DATE_RANGE_START = new Date('2020-01-01');
const BOT_DATE_RANGE_MONTHS_FROM_NOW = 1;
const TOP_MONTHS_TO_EXCLUDE = 5;

export interface BotAnalysis {
  totalViewers: number;
  authenticatedUsers: number;
  suspectedBots: number;
  botPercentage: number;
  legitimatePercentage: number;
  monthlyDistribution: MonthBucket[];
  baseline: number;
  spikeMonths: string[];
  accountAgeStats: {
    avgDays: number;
    medianDays: number;
    under30Days: number;
    under90Days: number;
    under1Year: number;
  };
}

export interface MonthBucket {
  month: string;
  count: number;
  isSpike: boolean;
  isBotMonth: boolean;
}

export function analyzeBotPatterns(
  accountDates: { login: string; createdAt: string }[]
): BotAnalysis {
  const empty: BotAnalysis = {
    totalViewers: 0, authenticatedUsers: 0, suspectedBots: 0,
    botPercentage: 0, legitimatePercentage: 100,
    monthlyDistribution: [], baseline: 0, spikeMonths: [],
    accountAgeStats: { avgDays: 0, medianDays: 0, under30Days: 0, under90Days: 0, under1Year: 0 },
  };
  if (accountDates.length === 0) return empty;

  const now = Date.now();

  // ─── Account age stats (all accounts) ─────
  const ages: number[] = [];
  let under30 = 0, under90 = 0, under1y = 0;
  for (const acc of accountDates) {
    if (!acc.createdAt) continue;
    const days = Math.floor((now - new Date(acc.createdAt).getTime()) / 86400000);
    ages.push(days);
    if (days < 30) under30++;
    if (days < 90) under90++;
    if (days < 365) under1y++;
  }
  ages.sort((a, b) => a - b);
  const avgDays = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  const medianDays = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 0;
  const totalValid = ages.length;

  // ─── Date range for bot detection ─────
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() - BOT_DATE_RANGE_MONTHS_FROM_NOW);

  // ─── ALL months (for chart) ─────
  const allMonthCounts = new Map<string, number>();
  for (const acc of accountDates) {
    if (!acc.createdAt) continue;
    const d = new Date(acc.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    allMonthCounts.set(key, (allMonthCounts.get(key) || 0) + 1);
  }

  // ─── Bot range months only ─────
  const botMonths = new Map<string, number>();
  for (const acc of accountDates) {
    if (!acc.createdAt) continue;
    const d = new Date(acc.createdAt);
    if (d >= BOT_DATE_RANGE_START && d <= endDate) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      botMonths.set(key, (botMonths.get(key) || 0) + 1);
    }
  }

  // ─── Extension algorithm: exclude top 5 months, calc baseline ─────
  // Step 1: Sort months descending by count
  const sortedEntries = Array.from(botMonths.entries()).sort((a, b) => b[1] - a[1]);

  // Step 2: Exclude top 5 (or fewer if not enough months)
  const toExclude = Math.min(TOP_MONTHS_TO_EXCLUDE, sortedEntries.length);
  const remaining = sortedEntries.slice(toExclude);

  // Step 3: maxExpectedAccounts = average of remaining months
  let maxExpected: number;
  if (remaining.length > 0) {
    const totalRemaining = remaining.reduce((sum, [, c]) => sum + c, 0);
    maxExpected = totalRemaining / remaining.length;
  } else {
    // All months excluded — use average of everything
    const allCounts = Array.from(botMonths.values());
    maxExpected = allCounts.length > 0
      ? allCounts.reduce((a, b) => a + b, 0) / allCounts.length
      : 1;
  }
  maxExpected = Math.max(1, maxExpected);

  // ─── Detect spikes: months exceeding maxExpected ─────
  const spikeMonths: string[] = [];
  let suspectedBots = 0;

  for (const [month, count] of botMonths) {
    if (count > maxExpected) {
      spikeMonths.push(month);
      suspectedBots += Math.max(0, count - Math.round(maxExpected));
    }
  }

  // ─── Chart data (all months) ─────
  const sortedAll = Array.from(allMonthCounts.keys()).sort();
  const monthlyDistribution: MonthBucket[] = sortedAll.map(month => ({
    month,
    count: allMonthCounts.get(month) || 0,
    isSpike: spikeMonths.includes(month),
    isBotMonth: spikeMonths.includes(month),
  }));

  // ─── Final: only show if >10% (false positive removal from extension) ─────
  const botPct = totalValid > 0 ? (suspectedBots / totalValid) * 100 : 0;
  const show = botPct > 10;

  return {
    totalViewers: totalValid,
    authenticatedUsers: totalValid,
    suspectedBots: show ? suspectedBots : 0,
    botPercentage: show ? Math.round(botPct * 10) / 10 : 0,
    legitimatePercentage: show ? Math.round((100 - botPct) * 10) / 10 : 100,
    monthlyDistribution,
    baseline: Math.round(maxExpected * 10) / 10,
    spikeMonths: show ? spikeMonths : [],
    accountAgeStats: { avgDays, medianDays, under30Days: under30, under90Days: under90, under1Year: under1y },
  };
}

// Classify individual viewer by monthly spike
export function classifyViewer(
  createdAt: string,
  spikeMonths: string[],
  _baseline: number
): boolean {
  if (!createdAt || spikeMonths.length === 0) return false;
  const d = new Date(createdAt);
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() - BOT_DATE_RANGE_MONTHS_FROM_NOW);
  if (d < BOT_DATE_RANGE_START || d > endDate) return false;
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return spikeMonths.includes(key);
}

// ─────────────────────────────────────────────────────────────
// Heurísticas por conta (melhoria sobre o algoritmo mensal):
// combina padrões de username, avatar padrão, seguidores e
// idade da conta numa pontuação 0–100 com razões explicáveis.
// ─────────────────────────────────────────────────────────────

export interface HeuristicInput {
  login: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
}

export interface HeuristicResult {
  score: number; // 0–100
  reasons: string[];
  level: 'bot' | 'suspeito' | 'ok';
}

const DEFAULT_AVATAR_PATTERNS = [
  'user-default-pictures',
  'user_typeimages',
  'default-profile-image',
  'xarth/404_user',
];

// Padrões típicos de usernames gerados por bots:
//   adjetivo_substantivo1234, user84920, StreamViewer_39021, aa12bb99, etc.
const BOT_USERNAME_PATTERNS: { re: RegExp; weight: number; reason: string }[] = [
  { re: /^[a-z]+_[a-z]+_\d{2,6}$/i, weight: 30, reason: 'Nome no formato palavra_palavra_número (típico de bots gerados)' },
  { re: /^[a-z]+_\d{3,8}$/i, weight: 25, reason: 'Nome no formato palavra_número (típico de bots gerados)' },
  { re: /^(user|viewer|guest|stream)[-_]?\d{3,}$/i, weight: 35, reason: 'Nome genérico com números (user/viewer/guest + número)' },
  { re: /(?:[a-z]{2}\d{2}){2,}/i, weight: 25, reason: 'Padrão letras+números repetido (ex: ab12cd34)' },
  { re: /^\d+$/, weight: 40, reason: 'Nome composto apenas por números' },
  { re: /^[a-z]{8,}\d{4,}$/i, weight: 20, reason: 'Sequência de letras seguida de muitos números' },
];

export function scoreViewerHeuristics(input: HeuristicInput): HeuristicResult {
  const reasons: string[] = [];
  let score = 0;

  const ageDays = input.createdAt
    ? Math.floor((Date.now() - new Date(input.createdAt).getTime()) / 86400000)
    : -1;

  // 1) Avatar padrão (nunca personalizado) — sinal forte em contas novas
  const hasDefaultAvatar = DEFAULT_AVATAR_PATTERNS.some(p => (input.profileImageURL || '').toLowerCase().includes(p));
  if (hasDefaultAvatar) {
    score += ageDays >= 0 && ageDays < 90 ? 25 : 12;
    reasons.push('Avatar padrão da Twitch (nunca personalizado)');
  }

  // 2) Username típico de bot
  for (const p of BOT_USERNAME_PATTERNS) {
    if (p.re.test(input.login)) {
      score += p.weight;
      reasons.push(p.reason);
      break; // apenas o padrão mais forte conta
    }
  }

  // 3) Seguidores + idade
  if (ageDays >= 0) {
    if (ageDays < 7) {
      score += 20;
      reasons.push('Conta com menos de 7 dias');
    } else if (ageDays < 30) {
      score += 12;
      reasons.push('Conta com menos de 30 dias');
    }
    if (input.followers === 0 && ageDays < 90) {
      score += 10;
      reasons.push('0 seguidores numa conta recente');
    }
  }

  // 4) Conta antiga com avatar padrão e 0 seguidores é menos suspeita
  if (ageDays > 365 && input.followers > 0) score -= 10;

  score = Math.max(0, Math.min(100, score));

  const level: HeuristicResult['level'] = score >= 60 ? 'bot' : score >= 35 ? 'suspeito' : 'ok';
  return { score, reasons, level };
}
