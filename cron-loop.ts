import "dotenv/config";
import { aggregate, pickTopAndStore } from "./lib/aggregate";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runOnce(): Promise<void> {
  const startedAt = new Date();
  console.log(`[cron-loop] start ${startedAt.toISOString()}`);
  try {
    const aggregated = await aggregate();
    const { stored, topPicks } = await pickTopAndStore(aggregated, 2);
    console.log(`[cron-loop] stored ${stored} rows`);
    for (const pick of topPicks) {
      console.log(
        `  #${pick.pickRank} ${pick.homeTeam} vs ${pick.awayTeam} → ${pick.tip}`,
      );
    }
  } catch (error) {
    console.error("[cron-loop] error:", error);
  }
  console.log(
    `[cron-loop] done in ${(Date.now() - startedAt.getTime()) / 1000}s`,
  );
}

async function main(): Promise<void> {
  await runOnce();
  setInterval(runOnce, ONE_DAY_MS);
}

main().catch((error) => {
  console.error("[cron-loop] fatal:", error);
  process.exit(1);
});
