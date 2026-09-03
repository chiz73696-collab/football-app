import { db, isDbConfigured } from "../../src/db";
import { predictions, type NewPrediction } from "../../src/db/schema";
import {
  scrapeAllNigeriaFootball,
  type RawPrediction,
} from "./sources";

type Aggregated = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  tip: string;
  confidenceScore: number;
  matchDate: string;
  matchTime: string;
  reasoning: string;
  source: string;
  status: "pending" | "won" | "lost";
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTime(): string {
  const d = new Date();
  return d.toISOString().slice(11, 16);
}

export async function aggregate(): Promise<Aggregated[]> {
  console.log("[cron] fetching from allnigeriafootball.com ...");
  const rows: RawPrediction[] = await scrapeAllNigeriaFootball();
  console.log(`[cron] scraped ${rows.length} candidate rows`);

  // Filter out any rows that already lost, then keep only future/today.
  const safe = rows.filter((r) => r.status !== "lost");

  if (safe.length === 0) {
    // Hard fallback if the site is unreachable / empty: still keep cron green.
    console.warn("[cron] no rows from source, using a single safe fallback");
    return [
      {
        homeTeam: "TBD (source unreachable)",
        awayTeam: "TBD",
        league: "Daily fallback",
        tip: "Pending",
        confidenceScore: 0.5,
        matchDate: todayDate(),
        matchTime: nowTime(),
        reasoning:
          "allnigeriafootball.com was unreachable from the cron worker; no live picks stored.",
        source: "allnigeriafootball.com",
        status: "pending",
      },
    ];
  }

  return safe.map((r) => ({
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    league: r.league,
    tip: r.tip,
    confidenceScore: r.confidence,
    matchDate: r.matchDate,
    matchTime: r.matchTime,
    reasoning: `Source: allnigeriafootball.com — ${r.status} (${r.tip}).`,
    source: r.source,
    status: r.status,
  }));
}

export async function pickTopAndStore(
  aggregated: Aggregated[],
  topN = 2,
): Promise<{ stored: number; topPicks: NewPrediction[] }> {
  if (!isDbConfigured) {
    console.error("[cron] DATABASE_URL is not set, cannot persist");
    return { stored: 0, topPicks: [] };
  }

  // Only the very strongest, pending/today matches make it as top picks.
  const ranked = [...aggregated]
    .filter((r) => r.status !== "lost")
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, topN);

  try {
    await db.delete(predictions);
  } catch (error) {
    console.warn(
      "[cron] could not delete previous predictions (table may not exist yet):",
      error instanceof Error ? error.message : error,
    );
  }

  const topRows: NewPrediction[] = ranked.map((row, idx) => ({
    matchDate: row.matchDate,
    matchTime: row.matchTime,
    league: row.league,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    tip: row.tip,
    confidenceScore: row.confidenceScore,
    isTopPick: true,
    pickRank: idx + 1,
    reasoning: row.reasoning,
  }));

  // Keep a slim "all" view of the upcoming matches from the same source.
  const allRows: NewPrediction[] = aggregated
    .filter((r) => r.status !== "lost")
    .slice(0, 20)
    .map((row) => ({
      matchDate: row.matchDate,
      matchTime: row.matchTime,
      league: row.league,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      tip: row.tip,
      confidenceScore: row.confidenceScore,
      isTopPick: false,
      pickRank: null,
      reasoning: row.reasoning,
    }));

  const finalRows = [...topRows, ...allRows];

  try {
    const inserted = await db
      .insert(predictions)
      .values(finalRows)
      .returning();
    return { stored: inserted.length, topPicks: topRows };
  } catch (error) {
    console.error(
      "[cron] insert failed (table missing? run drizzle-kit push):",
      error instanceof Error ? error.message : error,
    );
    return { stored: 0, topPicks: [] };
  }
}
