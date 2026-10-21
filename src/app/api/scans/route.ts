import { NextResponse } from "next/server";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { sql } from "drizzle-orm";
import { EMPTY_SCAN_STATS, getScanStats } from "@/lib/scan-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getScanStats());
  } catch {
    return NextResponse.json(EMPTY_SCAN_STATS);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const channel = String(b.channel ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
  }

  const num = (v: unknown, max = 10_000_000): number =>
    Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const pct = (v: unknown): string =>
    Math.max(0, Math.min(100, Number(v) || 0)).toFixed(2);

  const spikeMonths = Array.isArray(b.spikeMonths)
    ? b.spikeMonths.filter((m): m is string => typeof m === "string").slice(0, 36)
    : [];

  try {
    // Throttle: máx. 1 scan por canal a cada 60s
    const recentRows = (
      await db.execute(sql`
        SELECT id FROM scans
        WHERE channel = ${channel}
          AND created_at > now() - interval '60 seconds'
        LIMIT 1
      `)
    ).rows;
    if (recentRows.length > 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await db.insert(scans).values({
      channel,
      displayName: String(b.displayName ?? channel).slice(0, 128),
      avatarUrl: String(b.avatarUrl ?? "").slice(0, 500),
      isLive: Boolean(b.isLive),
      streamViewers: num(b.streamViewers, 100_000_000),
      trackedViewers: num(b.trackedViewers, 1_000_000),
      authenticatedUsers: num(b.authenticatedUsers, 1_000_000),
      suspectedBots: num(b.suspectedBots, 1_000_000),
      botPercentage: pct(b.botPercentage),
      baseline: String(Number(b.baseline) || 0),
      spikeMonths,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Falha ao guardar scan" }, { status: 500 });
  }
}
