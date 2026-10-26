import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials are required.");
const headers = { apikey: key, authorization: `Bearer ${key}`, "x-internal-service-key": key, "content-type": "application/json" };
const endpoint = `${url}/functions/v1/game-analysis`;
const probe = await fetch(endpoint, { method: "POST", headers, signal: AbortSignal.timeout(20_000), body: JSON.stringify({
  gameId: "0022600112", game: { gameId: "0022600112", gameStatus: 2, period: 1, gameClock: "11:00",
    homeTeam: { teamId: "1" }, awayTeam: { teamId: "2" },
    boxScore: { home: { totals: { points: 0 } }, away: { totals: { points: 0 } } },
    playByPlayActions: [{ actionNumber: 1, orderNumber: 1, period: 1, clock: "11:00", teamId: "1", personId: 10,
      actionType: "2pt", shotResult: "Made", scoreHome: 2, scoreAway: 0 }] },
}) });
const probeData = await probe.json();
if (probe.status !== 409 || probeData.code !== "LIVE_FEED_CONFLICT" || !probeData.retryable) {
  throw new Error(`Production analysis guard did not pass verification (${probe.status}).`);
}
console.log("Production conflict guard verified: retryable 409; no model call or cache write.");
if (process.env.APPLY !== "true") {
  console.log("Read-only verification complete. No saved analyses changed.");
} else {
  const directory = "output/audited-analysis-repair";
  await mkdir(directory, { recursive: true });
  const backup = await fetch(`${url}/rest/v1/game_analysis_segments?game_id=in.(0022600112,0022600118)&select=*`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!backup.ok) throw new Error(`Unable to back up existing recaps (${backup.status}).`);
  await writeFile(`${directory}/before.json.gz`, gzipSync(JSON.stringify(await backup.json())));
  const summary = [];
  for (const [gameId, segment, period] of [["0022600112", "q2", 2], ["0022600112", "q4", 4], ["0022600118", "q2", 2], ["0022600118", "q3", 3]]) {
    const response = await fetch(endpoint, { method: "POST", headers, signal: AbortSignal.timeout(120_000), body: JSON.stringify({
      gameId, range: { minPeriod: period, minClock: "12:00", maxPeriod: period, maxClock: "0:00" },
      cache: { segmentKey: segment, segmentLabel: `Q${period}` },
    }) });
    const result = await response.json();
    if (!response.ok || result.error || !result.cache || !result.feedSignature) {
      throw new Error(`Unable to repair ${gameId} ${segment} (${response.status}).`);
    }
    await writeFile(`${directory}/${gameId}-${segment}.json.gz`, gzipSync(JSON.stringify(result)));
    summary.push({ gameId, segment, source: result.source, generatedAt: result.cache.generatedAt, headline: result.headline });
    await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary.at(-1)));
  }
}
