import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface ScanSummary {
  channel: string;
  displayName: string;
  avatarUrl: string;
  isLive: boolean;
  streamViewers: number;
  trackedViewers: number;
  suspectedBots: number;
  botPercentage: number;
  createdAt: string;
}

export interface ScanStats {
  totalScans: number;
  channelsScanned: number;
  viewersAnalyzed: number;
  botsDetected: number;
  recent: ScanSummary[];
  leaderboard: ScanSummary[];
}

export const EMPTY_SCAN_STATS: ScanStats = {
  totalScans: 0,
  channelsScanned: 0,
  viewersAnalyzed: 0,
  botsDetected: 0,
  recent: [],
  leaderboard: [],
};

interface RawScanRow {
  channel: string;
  display_name: string;
  avatar_url: string;
  is_live: boolean;
  stream_viewers: number;
  tracked_viewers: number;
  suspected_bots: number;
  bot_percentage: string;
  created_at: string | Date;
}

function toSummary(r: RawScanRow): ScanSummary {
  return {
    channel: r.channel,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    isLive: r.is_live,
    streamViewers: r.stream_viewers,
    trackedViewers: r.tracked_viewers,
    suspectedBots: r.suspected_bots,
    botPercentage: Number(r.bot_percentage),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  };
}

/** Estatísticas globais + scans recentes + leaderboard. Nunca lança erro. */
export async function getScanStats(): Promise<ScanStats> {
  try {
    const [totals] = (
      await db.execute(sql`
        SELECT
          COUNT(*)::int                          AS total_scans,
          COUNT(DISTINCT channel)::int           AS channels,
          COALESCE(SUM(tracked_viewers), 0)::int AS viewers,
          COALESCE(SUM(suspected_bots), 0)::int  AS bots
        FROM scans
      `)
    ).rows as unknown as {
      total_scans: number;
      channels: number;
      viewers: number;
      bots: number;
    }[];

    const latest = (
      await db.execute(sql`
        SELECT DISTINCT ON (channel)
          channel, display_name, avatar_url, is_live, stream_viewers,
          tracked_viewers, suspected_bots, bot_percentage, created_at
        FROM scans
        ORDER BY channel, created_at DESC
        LIMIT 200
      `)
    ).rows as unknown as RawScanRow[];

    const summaries = latest.map(toSummary);

    const recent = [...summaries]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 8);

    const leaderboard = [...summaries]
      .filter((s) => s.trackedViewers >= 15)
      .sort((a, b) => b.botPercentage - a.botPercentage)
      .slice(0, 5);

    return {
      totalScans: totals?.total_scans ?? 0,
      channelsScanned: totals?.channels ?? 0,
      viewersAnalyzed: totals?.viewers ?? 0,
      botsDetected: totals?.bots ?? 0,
      recent,
      leaderboard,
    };
  } catch {
    return EMPTY_SCAN_STATS;
  }
}
