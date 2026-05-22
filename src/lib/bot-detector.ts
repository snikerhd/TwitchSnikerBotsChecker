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
