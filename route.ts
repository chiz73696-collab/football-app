import { NextRequest } from "next/server";
import { db, isDbConfigured } from "@/db";
import { predictions, type Prediction } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDbConfigured) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = Math.max(1, Math.min(50, Number(limitParam ?? 10) || 10));

    const allRows: Prediction[] = await db
      .select()
      .from(predictions)
      .orderBy(desc(predictions.scrapedAt))
      .limit(limit);

    const topPicks = allRows
      .filter((row) => row.isTopPick)
      .sort((a, b) => (a.pickRank ?? 99) - (b.pickRank ?? 99))
      .slice(0, 2);

    return Response.json({ ok: true, topPicks, predictions: allRows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  if (!isDbConfigured) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    await db.delete(predictions);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  // Lightweight manual trigger; cron is a separate service.
  if (!isDbConfigured) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    const samples: typeof predictions.$inferInsert[] = [
      {
        matchDate: now.toISOString().slice(0, 10),
        matchTime: "20:00",
        league: "Sample League",
        homeTeam: "Home FC",
        awayTeam: "Away United",
        tip: "1X",
        confidenceScore: 0.78,
        isTopPick: true,
        pickRank: 1,
        reasoning: "Manual seed (replace via cron)",
        scrapedAt: now,
      },
      {
        matchDate: now.toISOString().slice(0, 10),
        matchTime: "22:30",
        league: "Sample League",
        homeTeam: "Alpha SC",
        awayTeam: "Beta City",
        tip: "Over 2.5",
        confidenceScore: 0.71,
        isTopPick: true,
        pickRank: 2,
        reasoning: "Manual seed (replace via cron)",
        scrapedAt: now,
      },
    ];

    const inserted = await db.insert(predictions).values(samples).returning();
    return Response.json({ ok: true, inserted: inserted.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
