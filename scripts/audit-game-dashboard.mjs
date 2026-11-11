import { fetchNbaMinutes } from "../supabase/functions/_shared/nbaMinutes.js";
import { fetchNbaSegmentBox } from "../supabase/functions/_shared/nbaGame.js";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { aggregateSegmentStats, computeKills, countPossessionsByTeam } from "../src/segmentStats.js";
import { buildGameAlerts } from "../src/gameAlerts.js";
import { normalizeGameMidrangeStats } from "../src/boxScoreNormalization.js";
import { normalizeOpeningMinutesData } from "../supabase/functions/_shared/minutesNormalization.ts";
import { buildCompletedPeriodSnapshots } from "../src/periodSnapshotTotals.js";
import { fetchRecoverableGame } from "../supabase/functions/_shared/nbaLiveRecovery.ts";
import { buildMinutesExplorer } from "../src/minutesExplorer.js";
import { threePointOffensiveReboundPercent } from "../src/customStatRates.js";

const gameId = process.argv.find((arg) => arg.startsWith("--game-id="))?.split("=")[1] || "0022600108";
const output = process.argv.find((arg) => arg.startsWith("--output="))?.split("=")[1] || `/tmp/audit-${gameId}.json`;
const segments = ["all", "q1", "q2", "q3", "q4", "first-half", "second-half", "q1-q3"];
const apiSegments = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", "first-half": "1H", "second-half": "2H", "q1-q3": "Q1-Q3" };
const rawGame = await fetchRecoverableGame(gameId);
const rawMinutes = await fetchNbaMinutes(rawGame, process.env.NBA_API_KEY);
const rawSegments = await Promise.all(segments.slice(1).map(s => fetchNbaSegmentBox(rawGame, apiSegments[s], process.env.NBA_API_KEY)));
if (String(rawGame.gameId) !== gameId || !rawGame.playByPlayActions?.length
  || rawSegments.some(g => String(g.gameId) !== gameId)) throw new Error("Invalid or incomplete game/segment identity");
const game = normalizeGameMidrangeStats(rawGame);
const minutes = normalizeOpeningMinutesData(rawMinutes, game);
const basePlayers = ["away", "home"].flatMap((side) => game.boxScore[side].players.map((p) => ({ ...p, teamId: game[`${side}Team`].teamId })));
const officialUrl = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
const officialResponse = await fetch(officialUrl, { headers: { Accept:"application/json", "User-Agent":"Mozilla/5.0", Referer:"https://www.nba.com/" }, signal: AbortSignal.timeout(15000) });
if (!officialResponse.ok) throw new Error(`${officialUrl}: ${officialResponse.status}`);
const official = await officialResponse.json();
if (String(official.game?.gameId) !== gameId) throw new Error("Official box-score identity mismatch");
const fields = ["points", "reboundsTotal", "reboundsOffensive", "assists", "blocks", "steals", "turnovers", "foulsPersonal", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted", "freeThrowsMade", "freeThrowsAttempted", "rimFieldGoalsMade", "rimFieldGoalsAttempted", "midFieldGoalsMade", "midFieldGoalsAttempted"];
function diffs(a, b, keys = fields) {
  return keys.filter((k) => a?.[k] !== undefined && b?.[k] !== undefined && Number(a[k]) !== Number(b[k])).map((k) => ({ field: k, actual: a[k], reference: b[k] }));
}
const bySegment = {};
for (const [index, segment] of segments.entries()) {
  const source = index ? normalizeGameMidrangeStats(rawSegments[index - 1]) : game;
  const derived = aggregateSegmentStats({ gameId, actions: game.playByPlayActions, segment, minutesData: minutes, homeTeam: game.homeTeam, awayTeam: game.awayTeam, basePlayers, currentPeriod: game.period, currentClock: game.gameClock, isLive: false });
  const teams = {};
  for (const side of ["away", "home"]) {
    const id = game[`${side}Team`].teamId;
    const players = source.boxScore[side].players;
    const sum = Object.fromEntries(fields.map((f) => [f, players.reduce((n, p) => n + (Number(p[f]) || 0), 0)]));
    const officialPlayers = official?.game?.[`${side}Team`]?.players || [];
    teams[side] = {
      source: source.boxScore[side].totals, derived: derived.teamTotals[id], playerSum: sum,
      sourceVsDerived: diffs(source.boxScore[side].totals, derived.teamTotals[id]),
      playerMismatches: players.flatMap((p) => {
        const d = derived.playerMap.get(p.personId) || derived.playerMap.get(Number(p.personId)) || {};
        return diffs(d, p).map((issue) => ({ name: `${p.firstName} ${p.familyName}`, id: p.personId, ...issue }));
      }),
      sourceVsOfficial: segment === "all" ? diffs(source.boxScore[side].totals, {
        ...official.game[`${side}Team`].statistics,
        // NBA team reboundsTotal includes team/dead-ball rebounds; our visible
        // box total is the sum of personal rebounds, as in the player rows.
        reboundsTotal: official.game[`${side}Team`].statistics.reboundsPersonal,
      }) : null,
      officialPlayerMismatches: segment === "all" ? players.flatMap((p) => {
        const officialPlayer = officialPlayers.find((o) => String(o.personId) === String(p.personId));
        return diffs(p, officialPlayer?.statistics, [...fields, "plusMinusPoints"]).map((issue) => ({ name: `${p.firstName} ${p.familyName}`, ...issue }));
      }) : null,
      minuteSum: [...derived.playerMap.values()].filter((p) => players.some((s) => String(s.personId) === String(p.personId))).reduce((n, p) => n + p.minutes, 0),
    };
  }
  const reboundRates = Object.fromEntries(["away", "home"].map(side => {
    const totals = derived.teamTotals[game[`${side}Team`].teamId];
    return [side, {threePointOReb:totals.threePointOReb || 0, missedThrees:totals.threePointersAttempted-totals.threePointersMade, percent:threePointOffensiveReboundPercent(totals)}];
  }));
  bySegment[segment] = { teams, reboundRates, teamStats: source.teamStats, pbpLength: source.playByPlayActions?.length || 0, kills: computeKills(game.playByPlayActions, segment, game.homeTeam.teamId, game.awayTeam.teamId), possessions: countPossessionsByTeam(game.playByPlayActions, segment, game.homeTeam.teamId, game.awayTeam.teamId) };
}
for (const file of [".env", ".env.local"]) {
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trim().startsWith("#")) {
        const key = line.slice(0, i).trim();
        if (!process.env[key]) process.env[key] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch { /* optional local config */ }
}
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function rows(table, cols = "*") {
  const { data, error } = await db.from(table).select(cols).eq("game_id", gameId);
  return error ? { error: error.message } : data;
}
const [analysis, snapshots, liveState] = await Promise.all([
  rows("game_analysis_segments"), rows("period_snapshots"), rows("game_live_state", "game_id,updated_at,source_updated_at,diagnostics"),
]);
const recomputedSnapshots = buildCompletedPeriodSnapshots(game);
const snapshotDiffs = Array.isArray(snapshots) ? snapshots.map((s) => ({ period: s.period, team: s.team_id, version: s.totals?._captureVersion, diffs: diffs(s.totals, recomputedSnapshots.find((r) => Number(r.period) === Number(s.period) && String(r.team_id) === String(s.team_id))?.totals, Object.keys(s.totals || {})) })) : snapshots;
const alerts = buildGameAlerts({ game, basePlayers, minutesData: minutes });
const allAlerts = buildGameAlerts({ game, basePlayers, minutesData: minutes, maxAlerts: 10000 });
const minutesIssues = buildMinutesExplorer(minutes, game).issues;
const quarterAdditivity = ["away", "home"].flatMap(side => fields.flatMap(field => {
  const full = game.boxScore[side].totals[field];
  const quarters = ["q1", "q2", "q3", "q4"].map(key => bySegment[key].teams[side].source[field]);
  if (Number(game.period) > 4 || full == null || quarters.some(v => v == null)) return [];
  const sum = quarters.reduce((a,b)=>a+Number(b),0);
  return sum === Number(full) ? [] : [{side,field,full,sum}];
}));
const sourceWarnings = Object.entries(bySegment).flatMap(([segment,row]) => Object.entries(row.teams).flatMap(([side,team]) =>
  Number(team.source.points) === 0 && Number(team.derived.points) > 0 && !sourceHasPlayers(segment, side)
    ? [`${segment} ${side}: primary segment endpoint returned an empty box; compare derived totals with supported quarter sums, not fabricated zeroes.`] : []));
function sourceHasPlayers(segment, side) {
  const index = segments.indexOf(segment);
  return Boolean((index ? rawSegments[index-1] : rawGame).boxScore?.[side]?.players?.length);
}
const report = { gameId, auditedAt: new Date().toISOString(), scope:"Read-only segment/core/zone/3P-OR/Minutes and alert inventory replay; alert prose and every custom statistic are not automatically certified. Rim/mid differences are definition differences and require separate adjudication, not automatic core-stat errors.", sourceWarnings, sourceAvailability:game.feedAvailability || {source:"primary"}, quarterAdditivity, minutesIssues, officialUrl, rawGame, game, rawMinutes, minutes, official, bySegment, analysis, snapshots, snapshotDiffs, liveState, alerts, allAlerts };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, teams: [game.awayTeam, game.homeTeam].map((t) => ({ code: t.teamTricode, score: t.score })), bySegment: Object.fromEntries(Object.entries(bySegment).map(([s, r]) => [s, { teams: Object.fromEntries(Object.entries(r.teams).map(([side, t]) => [side, { score: t.derived.points, sourceVsDerived: t.sourceVsDerived, playerMismatchCount: t.playerMismatches.length, sourceVsOfficial: t.sourceVsOfficial, officialPlayerMismatches: t.officialPlayerMismatches, minuteSum: t.minuteSum }])), kills: r.kills, possessions: r.possessions }])), analysis: Array.isArray(analysis) ? analysis.map((a) => ({ key: a.segment_key, generated: a.generated_at, source: a.source, resultKeys: Object.keys(a.result || {}) })) : analysis, snapshotDiffs, alerts: alerts.length, allAlerts: allAlerts.length, officialActionExample: official?.playByPlay?.actions?.slice(0, 2) }, null, 2));
