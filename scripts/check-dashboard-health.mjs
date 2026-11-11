import { fetchScoreboard } from "../supabase/functions/_shared/scoreboard.js";
// Bounded availability checks; no model calls, database writes or user content.
import { mkdir, writeFile } from "node:fs/promises";
import { fetchRecoverableGame } from "../supabase/functions/_shared/nbaLiveRecovery.ts";
import { buildCompletedPeriodSnapshots } from "../src/periodSnapshotTotals.js";
const site = "https://jamesfraschilla.github.io/nbadash/";
const nextDay = process.argv.includes("--reconcile");
const report = { checkedAt: new Date().toISOString(), mode: nextDay ? "recent-final-reconciliation" : "live-availability", games: [], failures: [], warnings: [] };
try {
  const response = await fetch(site, { signal: AbortSignal.timeout(8000) });
  const html = await response.text();
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/i)?.[1];
  if (!response.ok || !entry) throw Error("App entry unavailable");
  const asset = await fetch(new URL(entry, site), { signal: AbortSignal.timeout(8000) });
  if (!asset.ok || !/javascript/.test(asset.headers.get("content-type") || "")) throw Error("App JavaScript unavailable");
} catch (error) { report.failures.push(`Hosting: ${error.message}`); }
const games = new Map();
for (let offset = 0; offset < (nextDay ? 3 : 1); offset++) {
  const date = new Date(Date.now() - offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  try {
    const list = await fetchScoreboard(date, process.env.NBA_API_KEY);
    if (!Array.isArray(list)) throw Error("Invalid scoreboard contract");
    for (const g of list) {
      const tracked = [g.homeTeam, g.awayTeam].some(t => String(t?.teamId) === "1610612764" || ["WAS", "CCG"].includes(t?.teamTricode));
      if (tracked && (nextDay ? Number(g.gameStatus) === 3 : Number(g.gameStatus) === 2)) games.set(String(g.gameId), g);
    }
  } catch (error) { report.failures.push(`Scoreboard ${date}: ${error.message}`); }
}
for (const gameId of [...games.keys()].slice(0, 6)) {
  try {
    const game = await fetchRecoverableGame(gameId);
    const snapshots = nextDay ? buildCompletedPeriodSnapshots(game) : [];
    if (nextDay && snapshots.length !== Number(game.period) * 2) throw Error("Missing verified period endings");
    const entry = { gameId, status: game.gameStatus, events: game.playByPlayActions?.length || 0,
      source: game.feedAvailability?.source || "primary", verifiedPeriodSnapshots: snapshots.length };
    report.games.push(entry);
    if (game.feedAvailability) report.warnings.push(`${gameId}: using ${entry.source}; upstream repair is not confirmed`);
  } catch (error) { report.failures.push(`${gameId}: ${error.message}`); }
}
await mkdir("output/dashboard-health", { recursive: true });
await writeFile(`output/dashboard-health/${nextDay ? "reconciliation" : "availability"}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
for (const message of report.warnings) console.log(`::warning::${message.replace(/[\r\n]/g, " ")}`);
for (const message of report.failures) console.log(`::error::${message.replace(/[\r\n]/g, " ")}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Dashboard ${report.mode}\n\n${report.games.length} tracked games checked. ${report.failures.length} failures; ${report.warnings.length} degraded-source warnings.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`, { flag: "a" });
}
if (report.failures.length) process.exitCode = 1;
