import "dotenv/config";
import { aggregate, pickTopAndStore } from "./lib/aggregate";

async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(`[cron] start ${startedAt.toISOString()}`);

  const aggregated = await aggregate();
  console.log(`[cron] aggregated ${aggregated.length} candidate matches`);

  const { stored, topPicks } = await pickTopAndStore(aggregated, 2);
  console.log(`[cron] stored ${stored} rows; top picks:`);
  for (const pick of topPicks) {
    console.log(
      `  #${pick.pickRank} ${pick.homeTeam} vs ${pick.awayTeam} → ${pick.tip} (${(
        (pick.confidenceScore ?? 0) * 100
      ).toFixed(0)}%)`,
    );
  }

  console.log(
    `[cron] done in ${(Date.now() - startedAt.getTime()) / 1000}s`,
  );
}

main().catch((error) => {
  console.error("[cron] fatal:", error);
  process.exit(1);
});
