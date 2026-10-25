import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { aggregateSegmentStats, computeKills, countPossessionsByTeam } from "../src/segmentStats.js";
import { buildGameAlerts } from "../src/gameAlerts.js";
import { normalizeGameMidrangeStats } from "../src/boxScoreNormalization.js";
import { normalizeOpeningMinutesData } from "../supabase/functions/_shared/minutesNormalization.ts";
import { buildCompletedPeriodSnapshots } from "../src/periodSnapshotTotals.js";

const gameId = process.argv.find((arg) => arg.startsWith("--game-id="))?.split("=")[1] || "0022600108";
const output = process.argv.find((arg) => arg.startsWith("--output="))?.split("=")[1] || `/tmp/audit-${gameId}.json`;
const api = `https://d1rjt2wyntx8o7.cloudfront.net/api/games/${gameId}`;
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
const segments = ["all", "q1", "q2", "q3", "q4", "first-half", "second-half", "q1-q3"];
const apiSegments = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", "first-half": "1H", "second-half": "2H", "q1-q3": "Q1-Q3" };
const [rawGame, rawMinutes, ...rawSegments] = await Promise.all([json(api), json(`${api}/minutes`), ...segments.slice(1).map((s) => json(`${api}?segment=${apiSegments[s]}`))]);
const game = normalizeGameMidrangeStats(rawGame);
const minutes = normalizeOpeningMinutesData(rawMinutes, game);
const basePlayers = ["away", "home"].flatMap((side) => game.boxScore[side].players.map((p) => ({ ...p, teamId: game[`${side}Team`].teamId })));
const officialUrl = `https://www.nba.com/game/${game.awayTeam.teamTricode.toLowerCase()}-vs-${game.homeTeam.teamTricode.toLowerCase()}-${gameId}/box-score`;
const officialHtml = await fetch(officialUrl, { signal: AbortSignal.timeout(15000) }).then((r) => r.text());
const next = officialHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
const official = next ? JSON.parse(next[1]).props.pageProps : null;
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
      sourceVsOfficial: segment === "all" ? diffs(source.boxScore[side].totals, official?.game?.[`${side}Team`]?.statistics) : null,
      officialPlayerMismatches: segment === "all" ? players.flatMap((p) => {
        const officialPlayer = officialPlayers.find((o) => String(o.personId) === String(p.personId));
        return diffs(p, officialPlayer?.statistics, [...fields, "plusMinusPoints"]).map((issue) => ({ name: `${p.firstName} ${p.familyName}`, ...issue }));
      }) : null,
      minuteSum: [...derived.playerMap.values()].filter((p) => players.some((s) => String(s.personId) === String(p.personId))).reduce((n, p) => n + p.minutes, 0),
    };
  }
  bySegment[segment] = { teams, teamStats: source.teamStats, pbpLength: source.playByPlayActions.length, kills: computeKills(game.playByPlayActions, segment, game.homeTeam.teamId, game.awayTeam.teamId), possessions: countPossessionsByTeam(game.playByPlayActions, segment, game.homeTeam.teamId, game.awayTeam.teamId) };
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
const report = { gameId, auditedAt: new Date().toISOString(), officialUrl, rawGame, game, rawMinutes, minutes, official, bySegment, analysis, snapshots, snapshotDiffs, liveState, alerts, allAlerts };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, teams: [game.awayTeam, game.homeTeam].map((t) => ({ code: t.teamTricode, score: t.score })), bySegment: Object.fromEntries(Object.entries(bySegment).map(([s, r]) => [s, { teams: Object.fromEntries(Object.entries(r.teams).map(([side, t]) => [side, { score: t.derived.points, sourceVsDerived: t.sourceVsDerived, playerMismatchCount: t.playerMismatches.length, sourceVsOfficial: t.sourceVsOfficial, officialPlayerMismatches: t.officialPlayerMismatches, minuteSum: t.minuteSum }])), kills: r.kills, possessions: r.possessions }])), analysis: Array.isArray(analysis) ? analysis.map((a) => ({ key: a.segment_key, generated: a.generated_at, source: a.source, resultKeys: Object.keys(a.result || {}) })) : analysis, snapshotDiffs, alerts: alerts.length, allAlerts: allAlerts.length, officialActionExample: official?.playByPlay?.actions?.slice(0, 2) }, null, 2));
