import { db, isDbConfigured } from "@/db";
import { predictions, type Prediction } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadPredictions(): Promise<{
  topPicks: Prediction[];
  all: Prediction[];
  dbError: string | null;
}> {
  if (!isDbConfigured) {
    return { topPicks: [], all: [], dbError: "DATABASE_URL not set" };
  }
  try {
    const all: Prediction[] = await db
      .select()
      .from(predictions)
      .orderBy(desc(predictions.scrapedAt))
      .limit(50);

    const topPicks = all
      .filter((row) => row.isTopPick)
      .sort((a, b) => (a.pickRank ?? 99) - (b.pickRank ?? 99))
      .slice(0, 2);

    return { topPicks, all, dbError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { topPicks: [], all: [], dbError: message };
  }
}

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "-";
  return `${Math.round(score * 100)}%`;
}

export default async function HomePage() {
  const { topPicks, all, dbError } = await loadPredictions();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
            Daily Top 2 Picks · Source: allnigeriafootball.com
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            ⚽ Football Auto Predictions
          </h1>
          <p className="max-w-2xl text-slate-300">
            Two high-confidence picks per day, sourced from{" "}
            <a
              className="text-emerald-300 underline-offset-4 hover:underline"
              href="https://allnigeriafootball.com"
              rel="noreferrer"
              target="_blank"
            >
              allnigeriafootball.com
            </a>
            .
          </p>
          {dbError ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              Database not ready: {dbError}
            </div>
          ) : null}
        </header>

        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">🏆 Top 2 Picks</h2>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              {topPicks.length} of 2
            </span>
          </div>
          {topPicks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-300">
              No picks yet. Run{" "}
              <code className="rounded bg-black/30 px-1 py-0.5">
                npm run cron:scrape
              </code>{" "}
              to populate today&apos;s top 2.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {topPicks.map((pick) => (
                <article
                  key={pick.id}
                  className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 to-emerald-700/5 p-6 shadow-lg"
                >
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-emerald-300/80">
                    <span>Rank #{pick.pickRank ?? "-"}</span>
                    <span>{pick.league ?? "Unknown league"}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white">
                    {pick.homeTeam ?? "Home"}{" "}
                    <span className="text-slate-400">vs</span>{" "}
                    {pick.awayTeam ?? "Away"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {pick.matchDate ?? "-"} · {pick.matchTime ?? "-"}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">
                        Tip
                      </p>
                      <p className="text-2xl font-bold text-emerald-300">
                        {pick.tip ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-slate-400">
                        Confidence
                      </p>
                      <p className="text-2xl font-bold text-emerald-300">
                        {formatScore(pick.confidenceScore)}
                      </p>
                    </div>
                  </div>
                  {pick.reasoning ? (
                    <p className="mt-4 rounded-lg bg-black/30 p-3 text-sm text-slate-200">
                      {pick.reasoning}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {all.length > 0 ? (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">📋 All From Today</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                {all.length} matches
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Match</th>
                    <th className="px-4 py-3">League</th>
                    <th className="px-4 py-3">Tip</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Top?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {all.map((row) => (
                    <tr key={row.id} className="bg-white/[0.02]">
                      <td className="px-4 py-3 text-slate-300">
                        {row.matchDate} {row.matchTime}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {row.homeTeam}{" "}
                        <span className="text-slate-500">vs</span> {row.awayTeam}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.league}</td>
                      <td className="px-4 py-3 text-emerald-300">{row.tip}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatScore(row.confidenceScore)}
                      </td>
                      <td className="px-4 py-3">
                        {row.isTopPick ? (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                            #{row.pickRank ?? "-"}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <footer className="mt-12 text-center text-xs text-slate-500">
          Source:{" "}
          <a
            className="text-slate-300 underline-offset-4 hover:underline"
            href="https://allnigeriafootball.com"
            rel="noreferrer"
            target="_blank"
          >
            allnigeriafootball.com
          </a>{" "}
          · Cron runs via <code>npm run cron:scrape</code>.
        </footer>
      </div>
    </main>
  );
}
