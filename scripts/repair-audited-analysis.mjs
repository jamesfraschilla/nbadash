import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials are required.");
const headers = { apikey: key, authorization: `Bearer ${key}`, "x-internal-service-key": key, "content-type": "application/json" };
const endpoint = `${url}/functions/v1/game-analysis`;
const targetGameId = String(process.env.AUDIT_GAME_ID || "").trim();
if (targetGameId && !/^\d{10}$/.test(targetGameId)) throw new Error("AUDIT_GAME_ID must be a ten-digit game ID.");
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
  const scope = targetGameId ? `eq.${targetGameId}` : "in.(0022600112,0022600118)";
  const backup = await fetch(`${url}/rest/v1/game_analysis_segments?game_id=${scope}&select=*`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!backup.ok) throw new Error(`Unable to back up existing recaps (${backup.status}).`);
  const existing = await backup.json();
  await writeFile(`${directory}/before.json.gz`, gzipSync(JSON.stringify(existing)));
  // An explicit game repairs only already-saved completed segments. Never
  // generate a recap for an unfinished live quarter or touch another game.
  let repairs = [["0022600112", "q2", 2, 2], ["0022600112", "q4", 4, 4], ["0022600118", "q2", 2, 2], ["0022600118", "q3", 3, 3]];
  if (targetGameId) {
    const response = await fetch(`https://d1rjt2wyntx8o7.cloudfront.net/api/games/${targetGameId}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error("Unable to verify completed periods.");
    const game = await response.json();
    const completed = new Set((game.playByPlayActions || []).filter(a => a.actionType === "period" && a.subType === "end").map(a => Number(a.period)));
    const ranges = { q1: [1, 1], q2: [2, 2], q3: [3, 3], q4: [4, 4], "first-half": [1, 2], "second-half": [3, 4], "q1-q3": [1, 3] };
    repairs = existing.flatMap(row => {
      const bounds = ranges[row.segment_key];
      if (!bounds || !Array.from({ length: bounds[1] - bounds[0] + 1 }, (_, i) => bounds[0] + i).every(p => completed.has(p))) return [];
      return [[targetGameId, row.segment_key, ...bounds]];
    });
  }
  const summary = [];
  for (const [gameId, segment, minPeriod, maxPeriod] of repairs) {
    const response = await fetch(endpoint, { method: "POST", headers, signal: AbortSignal.timeout(120_000), body: JSON.stringify({
      gameId, range: { minPeriod, minClock: "12:00", maxPeriod, maxClock: "0:00" },
      cache: { segmentKey: segment, segmentLabel: existing.find(row => row.game_id === gameId && row.segment_key === segment)?.segment_label || (minPeriod === maxPeriod ? `Q${minPeriod}` : String(segment)) },
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
