#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";
import { extractOfficialCallEvents } from "../src/officiatingParser.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OFFICIAL_PAGE_URL = "https://official.nba.com/2025-26-nba-coachs-challenge-reviews/";
const REGULAR_SEASON_PDF_URL = "https://ak-static.cms.nba.com/wp-content/uploads/sites/4/2026/07/2025-26-NBA-Coachs-Challenges-04-13-26.pdf";
const PLAYOFFS_PDF_URL = "https://ak-static.cms.nba.com/wp-content/uploads/sites/4/2026/06/2025-26-NBA-Coachs-Challenges-06-15-26.pdf";
const DEFAULT_SEASON = "2025-26";
const SOURCE = "nba_official_challenge_pdf";
const NBA_REQUEST_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Officiating Importer)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readIntegerArg(name, fallback) {
  const value = Number(readArg(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${url} failed (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStatsPlayByPlayActions(gameId) {
  const payload = await fetchJson(
    `https://stats.nba.com/stats/playbyplayv3?GameID=${encodeURIComponent(gameId)}&StartPeriod=0&EndPeriod=0`,
    { headers: NBA_REQUEST_HEADERS }
  );
  return Array.isArray(payload?.game?.actions) ? payload.game.actions : [];
}

function readListArg(name, fallback = []) {
  const value = readArg(name);
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function fetchGame(gameId) {
  try {
    const game = await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`);
    const statsActions = await fetchStatsPlayByPlayActions(gameId).catch(() => []);
    return {
      ...game,
      playByPlayActions: statsActions.length ? statsActions : game.playByPlayActions,
      source: statsActions.length ? `${game.source || "cloudfront"}+stats_playbyplayv3` : game.source,
    };
  } catch (cloudfrontError) {
    try {
      const [boxscorePayload, livePlayByPlayPayload, statsActions] = await Promise.all([
        fetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
        }),
        fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
        }),
        fetchStatsPlayByPlayActions(gameId).catch(() => []),
      ]);
      return {
        ...(boxscorePayload.game || {}),
        gameId,
        playByPlayActions: statsActions.length ? statsActions : livePlayByPlayPayload.game?.actions || [],
        source: statsActions.length ? "nba_live_data+stats_playbyplayv3" : "nba_live_data",
      };
    } catch (liveDataError) {
      const firstMessage = cloudfrontError instanceof Error ? cloudfrontError.message : "CloudFront fetch failed";
      const secondMessage = liveDataError instanceof Error ? liveDataError.message : "NBA live-data fetch failed";
      throw new Error(`${firstMessage}; fallback failed: ${secondMessage}`);
    }
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function normalizedSeasonType(game, fallback = "") {
  return String(game.seasonType || fallback || "").replace(/^playoffs$/i, "Playoffs");
}

function normalizedGameDate(game, fallback = "") {
  return String(game.gameDate || game.gameEt || game.gameTimeUTC || fallback || "").slice(0, 10) || null;
}

function buildAssignmentRows(game, discovered = {}) {
  const officials = Array.isArray(game.officials) ? game.officials : [];
  return officials.map((official, index) => ({
    season: String(game.seasonYear || discovered.season || DEFAULT_SEASON),
    season_type: normalizedSeasonType(game, discovered.seasonType),
    game_id: String(game.gameId || discovered.gameId || ""),
    game_date: normalizedGameDate(game, discovered.gameDate),
    home_team: String(game.homeTeam?.teamTricode || discovered.homeTeam || ""),
    away_team: String(game.awayTeam?.teamTricode || discovered.awayTeam || ""),
    official_id: String(official.personId || official.officialId || ""),
    official_name: [official.firstName, official.familyName || official.lastName].filter(Boolean).join(" ").trim(),
    jersey_number: String(official.jerseyNum || official.jerseyNumber || "").trim(),
    role_key: index === 0 ? "crewChief" : "",
    assignment_order: index + 1,
    is_alternate: officials.length === 4 && index === 3,
    source: "game_metadata",
    source_payload: official,
  })).filter((row) => row.game_id && row.official_name);
}

function toCallRow(event) {
  return {
    season: event.season || DEFAULT_SEASON,
    season_type: event.seasonType,
    game_id: event.gameId,
    game_date: event.gameDate ? event.gameDate.slice(0, 10) : null,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    period: event.period,
    game_clock: event.gameClock,
    action_number: event.actionNumber,
    action_type: event.actionType,
    description: event.description,
    official_id: event.officialId,
    official_name: event.officialName,
    primary_category: event.primaryCategory,
    charged_team: event.chargedTeam,
    benefiting_team: event.benefitingTeam,
  };
}

function safeIdentifierToken(value) {
  return String(value || "chunk").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "chunk";
}

async function downloadPdf(url, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const filename = safeIdentifierToken(path.basename(new URL(url).pathname)) || "nba-challenge-log.pdf";
  const outputPath = path.join(outputDir, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/pdf,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Officiating Importer)",
    },
  });
  if (!response.ok) throw new Error(`Failed to download ${url} (${response.status})`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

function runPythonExtractor(pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/extract-nba-challenge-pdf.py", pdfPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`PDF extractor failed (${code}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Could not parse PDF extractor output: ${error.message}`));
      }
    });
  });
}

function inferSeasonType(row) {
  if (row.game_id?.startsWith("001")) return "Preseason";
  if (row.game_id?.startsWith("002")) return "Regular Season";
  if (row.game_id?.startsWith("004")) return "Playoffs";
  return "Regular Season";
}

function normalizeDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function normalizeOutcome(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "successful" || text === "overturned") return "successful";
  if (text === "unsuccessful" || text === "upheld" || text === "stands") return "unsuccessful";
  return text;
}

function normalizeChallengeType(value) {
  return String(value || "").replace(/^challenge(?: of called)?\s+/i, "").trim();
}

function toChallengeRow(row, { season, pdfUrl }) {
  const seasonType = inferSeasonType(row);
  return {
    season,
    season_type: seasonType,
    game_id: row.game_id || null,
    game_date: normalizeDate(row.date),
    home_team: row.home_team,
    away_team: row.away_team,
    challenging_team: row.team_challenged,
    period: Number.isFinite(Number(row.period)) ? Number(row.period) : null,
    game_clock: row.game_clock,
    challenge_type: normalizeChallengeType(row.trigger),
    initial_call: row.initial_call,
    call_ruling: row.final_ruling,
    ruling_outcome: row.ruling_description,
    challenge_outcome: normalizeOutcome(row.challenge_outcome),
    video_url: row.video_url,
    match_confidence: row.game_id ? 0.98 : 0.55,
    match_reason: row.game_id ? "matched-official-pdf-video-game-id" : "official-pdf-no-game-id",
    review_status: row.game_id ? "auto" : "needs_review",
    source: SOURCE,
    source_payload: {
      officialPageUrl: OFFICIAL_PAGE_URL,
      pdfUrl,
      pdfRow: row,
    },
  };
}

function applyFilters(rows, { seasonTypes, gameIdPrefixes }) {
  return rows.filter((row) => {
    if (seasonTypes.length && !seasonTypes.includes(row.season_type)) return false;
    if (!row.game_id) return true;
    if (gameIdPrefixes.length && !gameIdPrefixes.some((prefix) => String(row.game_id || "").startsWith(prefix))) return false;
    return true;
  });
}

function toSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function toSqlArray(values) {
  return `array[${values.map(toSqlString).join(", ")}]::text[]`;
}

function jsonBlock(rows) {
  return `$json$${JSON.stringify(rows)}$json$::jsonb`;
}

function insertFromJson(rows) {
  if (!rows.length) return "-- No challenge rows in this chunk.\n";
  const columns = [
    "season", "season_type", "game_id", "game_date", "home_team", "away_team", "challenging_team", "period",
    "game_clock", "challenge_type", "initial_call", "call_ruling", "ruling_outcome", "challenge_outcome",
    "video_url", "crew_chief_id", "crew_chief_name", "whistling_official_id", "whistling_official_name",
    "matched_action_number", "match_confidence", "match_reason", "review_status", "source", "source_payload",
  ];
  const types = {
    season: "text",
    season_type: "text",
    game_id: "text",
    game_date: "date",
    home_team: "text",
    away_team: "text",
    challenging_team: "text",
    period: "integer",
    game_clock: "text",
    challenge_type: "text",
    initial_call: "text",
    call_ruling: "text",
    ruling_outcome: "text",
    challenge_outcome: "text",
    video_url: "text",
    crew_chief_id: "text",
    crew_chief_name: "text",
    whistling_official_id: "text",
    whistling_official_name: "text",
    matched_action_number: "integer",
    match_confidence: "numeric",
    match_reason: "text",
    review_status: "text",
    source: "text",
    source_payload: "jsonb",
  };
  return [
    `insert into public.nba_coach_challenge_events (${columns.join(", ")})`,
    `select ${columns.join(", ")}`,
    `from jsonb_to_recordset(${jsonBlock(rows)}) as x(`,
    `  ${columns.map((column) => `${column} ${types[column]}`).join(",\n  ")}`,
    ");",
  ].join("\n");
}

function buildIngestSql(rows) {
  const gameIds = [...new Set(rows.map((row) => row.game_id).filter(Boolean))];
  return [
    "begin;",
    `delete from public.nba_coach_challenge_events`,
    `where game_id = any(${toSqlArray(gameIds)})`,
    `  and source = ${toSqlString(SOURCE)};`,
    insertFromJson(rows),
    "commit;",
  ].join("\n\n");
}

function chunkRowsByGame(rows, chunkSize) {
  const byGame = new Map();
  rows.forEach((row) => {
    const key = row.game_id || `missing-${row.game_date}-${row.challenging_team}-${row.period}-${row.game_clock}`;
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(row);
  });
  const chunks = [];
  let current = [];
  for (const group of byGame.values()) {
    if (current.length && current.length + group.length > chunkSize) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function writeSqlChunks({ outputDir, rows, chunkSize }) {
  await mkdir(outputDir, { recursive: true });
  const chunks = chunkRowsByGame(rows, chunkSize);
  const files = [];
  for (const [index, chunk] of chunks.entries()) {
    const first = safeIdentifierToken(chunk[0]?.game_id || chunk[0]?.game_date || "start");
    const last = safeIdentifierToken(chunk[chunk.length - 1]?.game_id || chunk[chunk.length - 1]?.game_date || "end");
    const filePath = path.join(outputDir, `${String(index + 1).padStart(3, "0")}-${first}-${last}.sql`);
    await writeFile(filePath, buildIngestSql(chunk));
    files.push(filePath);
  }
  return files;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "Unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function summarize(rows, generatedSqlChunks) {
  const wizardsGameRows = rows.filter((row) => row.home_team === "WAS" || row.away_team === "WAS");
  const wizardsChallengedRows = rows.filter((row) => row.challenging_team === "WAS");
  return {
    rows: rows.length,
    games: new Set(rows.map((row) => row.game_id).filter(Boolean)).size,
    seasonTypes: countBy(rows, "season_type"),
    challengeOutcomes: countBy(rows, "challenge_outcome"),
    teamsChallenged: countBy(rows, "challenging_team"),
    wizardsGameChallenges: wizardsGameRows.length,
    wizardsChallenges: wizardsChallengedRows.length,
    wizardsSuccessfulChallenges: wizardsChallengedRows.filter((row) => row.challenge_outcome === "successful").length,
    rowsWithCrewChief: rows.filter((row) => row.crew_chief_name).length,
    rowsWithWhistlingOfficial: rows.filter((row) => row.whistling_official_name).length,
    rowsNeedingReview: rows.filter((row) => row.review_status === "needs_review").length,
    rowsMissingGameId: rows.filter((row) => !row.game_id).length,
    generatedSqlChunks,
  };
}

async function enrichOfficialRows(challengeRows, { season, concurrency }) {
  const gameIds = [...new Set(challengeRows.map((row) => row.game_id).filter(Boolean))];
  const loadedGames = await mapWithConcurrency(gameIds, concurrency, async (gameId) => {
    try {
      const game = await fetchGame(gameId);
      return { gameId, game };
    } catch (error) {
      console.warn(`Could not enrich ${gameId}: ${error instanceof Error ? error.message : "unknown error"}`);
      return null;
    }
  });
  const games = loadedGames.filter(Boolean);
  const assignmentRows = games.flatMap(({ game, gameId }) => buildAssignmentRows(game, {
    season,
    gameId,
    seasonType: challengeRows.find((row) => row.game_id === gameId)?.season_type,
    gameDate: challengeRows.find((row) => row.game_id === gameId)?.game_date,
  }));
  const callRows = games.flatMap(({ game, gameId }) => extractOfficialCallEvents(game, {
    season,
    seasonType: challengeRows.find((row) => row.game_id === gameId)?.season_type,
    gameDate: challengeRows.find((row) => row.game_id === gameId)?.game_date,
  }).map(toCallRow));
  return enrichChallengeEventsWithOfficials(challengeRows, callRows, assignmentRows);
}

async function main() {
  await assertOutsideWizardsGameWindow("NBA challenge-log import");
  const season = readArg("season") || DEFAULT_SEASON;
  const sourceName = readArg("source");
  const explicitPdf = readArg("pdf");
  const pdfUrl = readArg("pdf-url") || (
    sourceName === "playoffs" ? PLAYOFFS_PDF_URL : REGULAR_SEASON_PDF_URL
  );
  const pdfPath = explicitPdf || await downloadPdf(pdfUrl, "test-results/nba-challenge");
  const seasonTypes = readListArg("season-types", sourceName === "playoffs" ? ["Playoffs"] : ["Preseason", "Regular Season"]);
  const gameIdPrefixes = readListArg("game-id-prefixes", seasonTypes.includes("Playoffs") ? ["004"] : ["001", "002"]);
  const outPath = readArg("out");
  const sqlOut = readArg("sql-out");
  const sqlDir = readArg("sql-dir");
  const sqlChunkSize = readIntegerArg("sql-chunk-size", 250);
  const enrichmentConcurrency = readIntegerArg("enrichment-concurrency", 4);

  const extractedRows = await runPythonExtractor(pdfPath);
  const baseChallengeRows = applyFilters(
    extractedRows.map((row) => toChallengeRow(row, { season, pdfUrl })),
    { seasonTypes, gameIdPrefixes }
  );
  const challengeRows = hasFlag("skip-official-enrichment")
    ? baseChallengeRows
    : await enrichOfficialRows(baseChallengeRows, { season, concurrency: enrichmentConcurrency });
  let generatedSqlChunks = [];
  if (sqlOut) {
    await mkdir(path.dirname(sqlOut), { recursive: true });
    await writeFile(sqlOut, buildIngestSql(challengeRows));
  }
  if (sqlDir) {
    generatedSqlChunks = await writeSqlChunks({ outputDir: sqlDir, rows: challengeRows, chunkSize: sqlChunkSize });
  }
  const report = summarize(challengeRows, generatedSqlChunks);
  if (outPath) {
    await writeJsonFile(outPath, { report, challengeRows });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
