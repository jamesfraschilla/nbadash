import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { setDefaultResultOrder } from "node:dns";
import { LIVE_AUDIT_GAMES } from "../src/liveAuditGames.js";
import { buildCompletedAnalysisSegments } from "../src/gameAnalysis.js";
import { aggregateSegmentStats, computeKills, countPossessionsByTeam } from "../src/segmentStats.js";
import { buildGameAlerts } from "../src/gameAlerts.js";
import { normalizeOpeningMinutesData } from "../supabase/functions/_shared/minutesNormalization.ts";

setDefaultResultOrder("ipv4first");
const API = "https://d1rjt2wyntx8o7.cloudfront.net/api/games";
const API_SEGMENTS = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", "first-half": "1H", "second-half": "2H", "q1-q3": "Q1-Q3" };
const MAX_BYTES = 100 * 1024 * 1024;
const POST_FINAL_MS = 15 * 60_000;

export function auditConfiguration(gameId, now = Date.now(), dryRun = false) {
  const game = LIVE_AUDIT_GAMES.find((item) => item.gameId === String(gameId));
  if (!game) throw new Error("Game is not in the approved three-game audit cohort.");
  const tipMs = Date.parse(game.tipUtc);
  const deadline = tipMs + 5 * 60 * 60_000;
  if (!dryRun && (now < tipMs - 20 * 60_000 || now >= deadline)) {
    throw new Error("Outside this game's one-night audit window; no requests or generation allowed.");
  }
  return { ...game, deadline };
}

export function readySegments(game) {
  if (![2, 3].includes(Number(game.gameStatus))) return [];
  return buildCompletedAnalysisSegments(game, Number(game.gameStatus) === 2).filter((segment) => {
    if (["all", "second-half"].includes(segment.key) && Number(game.gameStatus) !== 3) return false;
    const end = Number(segment.form.maxPeriod);
    return Number(game.gameStatus) === 3 || Number(game.period) > end
      || (game.playByPlayActions || []).some((a) => Number(a.period) === end && a.actionType === "period" && a.subType === "end");
  });
}

export function segmentRange(segment) {
  const f = segment.form;
  return {
    minPeriod: Number(f.minPeriod), minClock: `${Number(f.minMinutes)}:${f.minSeconds}`,
    maxPeriod: Number(f.maxPeriod), maxClock: `${Number(f.maxMinutes)}:${f.maxSeconds}`,
  };
}

export function reconcileGame(game, minutesData) {
  const basePlayers = ["away", "home"].flatMap((side) => (game.boxScore?.[side]?.players || [])
    .map((p) => ({ ...p, teamId: game[`${side}Team`]?.teamId })));
  const segments = {};
  const failures = [];
  for (const segment of ["all", ...readySegments(game).map((s) => s.key)].filter((s, i, a) => a.indexOf(s) === i)) {
    const stats = aggregateSegmentStats({ gameId: game.gameId, actions: game.playByPlayActions || [], segment,
      minutesData, homeTeam: game.homeTeam, awayTeam: game.awayTeam, basePlayers,
      currentPeriod: game.period, currentClock: game.gameClock, isLive: Number(game.gameStatus) === 2 });
    segments[segment] = { teamTotals: stats.teamTotals, players: [...stats.playerMap.values()],
      possessions: countPossessionsByTeam(game.playByPlayActions || [], segment, game.homeTeam.teamId, game.awayTeam.teamId),
      kills: computeKills(game.playByPlayActions || [], segment, game.homeTeam.teamId, game.awayTeam.teamId) };
  }
  for (const side of ["away", "home"]) {
    const team = game[`${side}Team`];
    const d = segments.all.teamTotals[team.teamId] || {};
    const b = game.boxScore?.[side]?.totals || {};
    for (const field of ["points", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted",
      "freeThrowsMade", "freeThrowsAttempted", "assists", "turnovers", "steals", "blocks", "foulsPersonal"]) {
      if (Number.isFinite(Number(b[field])) && Number(b[field]) !== Number(d[field])) {
        failures.push({ team: team.teamTricode, field, box: b[field], playByPlay: d[field] });
      }
    }
  }
  return { failures, segments, alerts: buildGameAlerts({ game, basePlayers, minutesData, maxAlerts: 10000 }) };
}

async function requestJson(url, options = {}, timeout = 20_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(`Request failed (${response.status}): ${payload.error || new URL(url).pathname}`);
  return payload;
}

export async function runAudit({ gameId, dryRun = false, outputRoot = "output/live-audit" }) {
  const config = auditConfiguration(gameId, Date.now(), dryRun);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase credentials are required.");
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "x-internal-service-key": serviceKey, "content-type": "application/json" };
  const directory = path.join(outputRoot, config.gameId);
  await fs.mkdir(directory, { recursive: true });
  const summary = { gameId, matchup: config.matchup, dryRun, startedAt: new Date().toISOString(),
    captures: 0, bytes: 0, ticks: 0, generated: [], reused: [], errors: [], anomalies: [], checkpoints: [], completed: false };
  let sequence = 0;
  let lastHash = "";
  let lastAnalysisHash = "";
  let minutesData = null;
  let minutesAt = 0;
  let lastPeriod = 0;
  let finalSeenAt = null;
  let generation = null;
  const attempted = new Map();
  const completed = new Set();
  const checkpoints = new Set();
  const archive = async (kind, data) => {
    const bytes = gzipSync(JSON.stringify({ capturedAt: new Date().toISOString(), ...data }));
    if (summary.bytes + bytes.length > MAX_BYTES) throw new Error("100 MiB archive cap reached.");
    const filename = `${String(++sequence).padStart(5, "0")}-${kind}.json.gz`;
    summary.bytes += bytes.length;
    await fs.writeFile(path.join(directory, filename), bytes);
    return filename;
  };
  const errorRecord = (stage, error) => {
    const record = { at: new Date().toISOString(), stage, message: String(error?.message || error).replaceAll(serviceKey, "[REDACTED]") };
    summary.errors.push(record);
    if (summary.errors.length > 150) summary.errors.shift();
    console.error(JSON.stringify(record));
  };
  const readAnalyses = () => requestJson(`${supabaseUrl}/rest/v1/game_analysis_segments?game_id=eq.${gameId}&select=segment_key,generated_at,source,result`, { headers });
  const prepare = async (segments) => {
    for (const segment of segments) {
      if (completed.has(segment.key) || (attempted.get(segment.key) || 0) >= 3) continue;
      attempted.set(segment.key, (attempted.get(segment.key) || 0) + 1);
      try {
        const result = await requestJson(`${supabaseUrl}/functions/v1/game-analysis`, {
          method: "POST", headers,
          body: JSON.stringify({ gameId, range: segmentRange(segment), cache: { segmentKey: segment.key, segmentLabel: segment.label } }),
        }, 70_000);
        await archive(`analysis-${segment.key}`, { segment: segment.key, result });
        completed.add(segment.key);
        summary.generated.push({ segment: segment.key, at: new Date().toISOString(), source: result.source, cached: result.cached });
        console.log(`Prepared ${gameId} ${segment.key}`);
      } catch (error) { errorRecord(`analysis:${segment.key}`, error); }
    }
  };
  const checkpoint = async (game, keys) => {
    const segmentFeeds = {};
    await Promise.all(keys.filter((key) => API_SEGMENTS[key]).map(async (key) => {
      try { segmentFeeds[key] = await requestJson(`${API}/${gameId}?segment=${API_SEGMENTS[key]}`); }
      catch (error) { errorRecord(`segment-feed:${key}`, error); }
    }));
    let official = null;
    try {
      const response = await fetch(`https://www.nba.com/game/${config.slug}-${gameId}/box-score`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`NBA page ${response.status}`);
      const html = await response.text();
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) throw new Error("NBA embedded data unavailable");
      const page = JSON.parse(match[1]).props.pageProps;
      official = { game: page.game, playByPlay: page.playByPlay };
    } catch (error) { errorRecord("official-checkpoint", error); }
    const file = await archive("checkpoint", { keys, game, segmentFeeds, official });
    summary.checkpoints.push({ at: new Date().toISOString(), keys, file });
  };
  try {
    // Fail fast on missing/expired hosted credentials rather than idle all night.
    await readAnalyses();
    do {
      const tickStart = Date.now();
      summary.ticks++;
      try {
        const game = await requestJson(`${API}/${gameId}`);
        if (String(game.gameId) !== gameId || !game.homeTeam?.teamId || !game.awayTeam?.teamId) throw new Error("Game feed identity/teams invalid");
        if (!minutesData || tickStart - minutesAt >= 5 * 60_000 || Number(game.period) !== lastPeriod) {
          try { minutesData = normalizeOpeningMinutesData(await requestJson(`${API}/${gameId}/minutes`), game); minutesAt = tickStart; }
          catch (error) { errorRecord("minutes", error); }
        }
        lastPeriod = Number(game.period);
        const hash = createHash("sha256").update(JSON.stringify(game)).digest("hex");
        if (hash !== lastHash) {
          const audit = reconcileGame(game, minutesData);
          const file = await archive("feed", { game, minutesData, audit });
          summary.captures++;
          lastHash = hash;
          if (audit.failures.length) summary.anomalies.push({ at: new Date().toISOString(), file, failures: audit.failures });
          if (summary.anomalies.length > 300) summary.anomalies.shift();
        }
        const analyses = await readAnalyses();
        const analysisHash = createHash("sha256").update(JSON.stringify(analyses)).digest("hex");
        if (analysisHash !== lastAnalysisHash) {
          await archive("saved-analysis", { analyses });
          lastAnalysisHash = analysisHash;
        }
        const segments = readySegments(game);
        for (const row of analyses) {
          if (!completed.has(row.segment_key) && row.result?.feedSignature) {
            completed.add(row.segment_key); summary.reused.push(row.segment_key);
          }
        }
        const newKeys = segments.map((s) => s.key).filter((key) => !checkpoints.has(key));
        if (newKeys.length) {
          await checkpoint(game, newKeys);
          newKeys.forEach((key) => checkpoints.add(key));
        }
        if (!dryRun && !generation) generation = prepare(segments).finally(() => { generation = null; });
        if (Number(game.gameStatus) === 3) {
          if (!finalSeenAt) finalSeenAt = tickStart;
          if (tickStart - finalSeenAt >= POST_FINAL_MS) {
            await checkpoint(game, ["final-plus-15-minutes"]);
            summary.completed = true;
            break;
          }
        }
      } catch (error) {
        errorRecord("capture", error);
        if (String(error.message).includes("archive cap")) break;
      }
      await fs.writeFile(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2));
      console.log(JSON.stringify({ gameId, tick: summary.ticks, captures: summary.captures, generated: completed.size, bytes: summary.bytes }));
      if (dryRun) break;
      // Ordinary low-CPU timer; no agent/model is running during this wait.
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, 60_000 - (Date.now() - tickStart))));
    } while (Date.now() < config.deadline);
  } finally {
    if (generation) await generation;
    summary.finishedAt = new Date().toISOString();
    summary.attempts = Object.fromEntries(attempted);
    summary.missingSegments = ["q1", "q2", "first-half", "q3", "q1-q3", "q4", "second-half", "all"].filter((key) => !completed.has(key));
    await fs.writeFile(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2));
  }
  if (!summary.captures || (!dryRun && (!summary.completed || summary.missingSegments.length))) {
    throw new Error("Audit ended incomplete; inspect summary.json and workflow errors.");
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const gameId = process.argv.find((arg) => arg.startsWith("--game-id="))?.split("=")[1];
  runAudit({ gameId, dryRun: process.argv.includes("--dry-run") }).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
