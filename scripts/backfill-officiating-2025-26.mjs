#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectCoachChallengeActions, extractOfficialCallEvents } from "../src/officiatingParser.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const STATS_API_URL = "https://stats.nba.com/stats/leaguegamefinder";
const WIZARDS_TEAM_ID = "1610612764";
const DEFAULT_SEASON = "2025-26";
const DEFAULT_GAME_IDS = ["0042500131"];
const DEFAULT_SEASON_TYPES = ["Regular Season", "Playoffs"];
const NBA_REQUEST_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Officiating Backfill)",
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

function readListArg(name, fallback = []) {
  const value = readArg(name);
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readIntegerArg(name, fallback) {
  const value = Number(readArg(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function writeTextFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`);
  }
  return response.json();
}

function parseRowSet(payload) {
  const resultSets = Array.isArray(payload?.resultSets) ? payload.resultSets : [];
  const resultSet = resultSets[0] || payload?.resultSet || {};
  const headers = Array.isArray(resultSet.headers) ? resultSet.headers : [];
  const rows = Array.isArray(resultSet.rowSet) ? resultSet.rowSet : [];
  return rows.map((row) => headers.reduce((accumulator, header, index) => {
    accumulator[String(header)] = Array.isArray(row) ? row[index] : undefined;
    return accumulator;
  }, {}));
}

async function fetchSeasonTypeRows({ season, seasonType, teamId }) {
  const url = new URL(STATS_API_URL);
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("PlayerOrTeam", "T");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", seasonType);
  url.searchParams.set("TeamID", teamId);

  const payload = await fetchJson(url.toString(), {
    headers: NBA_REQUEST_HEADERS,
  });

  return parseRowSet(payload).map((row) => ({ ...row, seasonType }));
}

async function discoverTeamGameIds({ season, seasonTypes, teamId, maxGames }) {
  const rowGroups = await Promise.all(
    seasonTypes.map((seasonType) => fetchSeasonTypeRows({ season, seasonType, teamId }).catch((error) => {
      console.warn(`Could not fetch ${seasonType}: ${error.message}`);
      return [];
    }))
  );
  const rows = rowGroups.flat()
    .filter((row) => row.GAME_ID)
    .sort((left, right) => {
      const dateCompare = String(left.GAME_DATE || "").localeCompare(String(right.GAME_DATE || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(left.GAME_ID || "").localeCompare(String(right.GAME_ID || ""));
    });
  const seen = new Set();
  const games = [];
  for (const row of rows) {
    const gameId = String(row.GAME_ID || "").trim();
    if (!gameId || seen.has(gameId)) continue;
    seen.add(gameId);
    games.push({
      gameId,
      gameDate: String(row.GAME_DATE || "").slice(0, 10),
      matchup: String(row.MATCHUP || ""),
      seasonType: String(row.seasonType || ""),
    });
    if (maxGames && games.length >= maxGames) break;
  }
  return games;
}

async function fetchGame(gameId) {
  try {
    return await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`);
  } catch (cloudfrontError) {
    try {
      const [boxscorePayload, playByPlayPayload] = await Promise.all([
        fetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
        }),
        fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
        }),
      ]);
      return {
        ...(boxscorePayload.game || {}),
        gameId,
        playByPlayActions: playByPlayPayload.game?.actions || [],
        source: "nba_live_data",
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

function categoryCounts(events) {
  return events.reduce((counts, event) => {
    const key = event.primaryCategory || event.primary_category || "unknown_official_event";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function confidenceCounts(events) {
  return events.reduce((counts, event) => {
    const bucket = Number(event.confidence || 0) >= 0.9
      ? "high"
      : Number(event.confidence || 0) >= 0.7
        ? "medium"
        : "low";
    counts[bucket] = (counts[bucket] || 0) + 1;
    return counts;
  }, { high: 0, medium: 0, low: 0 });
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
    season: String(game.seasonYear || DEFAULT_SEASON),
    season_type: normalizedSeasonType(game, discovered.seasonType),
    game_id: String(game.gameId || discovered.gameId || ""),
    game_date: normalizedGameDate(game, discovered.gameDate),
    home_team: String(game.homeTeam?.teamTricode || ""),
    away_team: String(game.awayTeam?.teamTricode || ""),
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
    order_number: event.orderNumber,
    action_type: event.actionType,
    sub_type: event.subType,
    descriptor: event.descriptor,
    description: event.description,
    official_token: event.officialToken,
    official_id: event.officialId,
    official_name: event.officialName,
    team_id: event.teamId,
    team_tricode: event.teamTricode,
    player_id: event.playerId,
    player_name: event.playerName,
    primary_category: event.primaryCategory,
    secondary_category: event.secondaryCategory,
    charged_team: event.chargedTeam,
    benefiting_team: event.benefitingTeam,
    confidence: event.confidence,
    confidence_reason: event.confidenceReason,
    source_payload: event.sourcePayload,
  };
}

function toChallengeRow(event) {
  return {
    season: event.season || DEFAULT_SEASON,
    season_type: event.seasonType,
    game_id: event.gameId,
    game_date: event.gameDate ? event.gameDate.slice(0, 10) : null,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    challenging_team: event.challengingTeam,
    period: event.period,
    game_clock: event.gameClock,
    challenge_outcome: event.challengeOutcome,
    matched_action_number: event.matchedActionNumber,
    match_confidence: event.matchConfidence,
    match_reason: event.matchReason,
    source: event.source,
    source_payload: event.sourcePayload,
  };
}

function toSqlArray(values) {
  return `array[${values.map((value) => `'${String(value).replaceAll("'", "''")}'`).join(", ")}]::text[]`;
}

function jsonBlock(rows) {
  return `$json$${JSON.stringify(rows)}$json$::jsonb`;
}

function insertFromJson({ table, columns, types, rows }) {
  if (!rows.length) return `-- No rows for ${table}.\n`;
  return [
    `insert into public.${table} (${columns.join(", ")})`,
    `select ${columns.join(", ")}`,
    `from jsonb_to_recordset(${jsonBlock(rows)}) as x(`,
    `  ${columns.map((column) => `${column} ${types[column]}`).join(",\n  ")}`,
    ");",
  ].join("\n");
}

function buildIngestSql({ gameIds, assignmentRows, callRows, challengeRows }) {
  const gameIdArray = toSqlArray(gameIds);
  const assignmentColumns = [
    "season", "season_type", "game_id", "game_date", "home_team", "away_team", "official_id", "official_name",
    "jersey_number", "role_key", "assignment_order", "is_alternate", "source", "source_payload",
  ];
  const callColumns = [
    "season", "season_type", "game_id", "game_date", "home_team", "away_team", "period", "game_clock",
    "action_number", "order_number", "action_type", "sub_type", "descriptor", "description", "official_token",
    "official_id", "official_name", "team_id", "team_tricode", "player_id", "player_name", "primary_category",
    "secondary_category", "charged_team", "benefiting_team", "confidence", "confidence_reason", "source_payload",
  ];
  const challengeColumns = [
    "season", "season_type", "game_id", "game_date", "home_team", "away_team", "challenging_team", "period",
    "game_clock", "challenge_outcome", "matched_action_number", "match_confidence", "match_reason", "source",
    "source_payload",
  ];
  const commonTypes = {
    season: "text",
    season_type: "text",
    game_id: "text",
    game_date: "date",
    home_team: "text",
    away_team: "text",
    source_payload: "jsonb",
  };

  return [
    "begin;",
    `delete from public.nba_coach_challenge_events where game_id = any(${gameIdArray});`,
    `delete from public.nba_official_call_events where game_id = any(${gameIdArray});`,
    `delete from public.nba_official_game_assignments where game_id = any(${gameIdArray});`,
    insertFromJson({
      table: "nba_official_game_assignments",
      columns: assignmentColumns,
      types: {
        ...commonTypes,
        official_id: "text",
        official_name: "text",
        jersey_number: "text",
        role_key: "text",
        assignment_order: "integer",
        is_alternate: "boolean",
        source: "text",
      },
      rows: assignmentRows,
    }),
    insertFromJson({
      table: "nba_official_call_events",
      columns: callColumns,
      types: {
        ...commonTypes,
        period: "integer",
        game_clock: "text",
        action_number: "integer",
        order_number: "integer",
        action_type: "text",
        sub_type: "text",
        descriptor: "text",
        description: "text",
        official_token: "text",
        official_id: "text",
        official_name: "text",
        team_id: "text",
        team_tricode: "text",
        player_id: "text",
        player_name: "text",
        primary_category: "text",
        secondary_category: "text",
        charged_team: "text",
        benefiting_team: "text",
        confidence: "numeric",
        confidence_reason: "text",
      },
      rows: callRows,
    }),
    insertFromJson({
      table: "nba_coach_challenge_events",
      columns: challengeColumns,
      types: {
        ...commonTypes,
        challenging_team: "text",
        period: "integer",
        game_clock: "text",
        challenge_outcome: "text",
        matched_action_number: "integer",
        match_confidence: "numeric",
        match_reason: "text",
        source: "text",
      },
      rows: challengeRows,
    }),
    "commit;",
  ].join("\n\n");
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function rowsForGameIds(rows, gameIds) {
  const allowed = new Set(gameIds);
  return rows.filter((row) => allowed.has(row.game_id));
}

async function writeSqlChunks({ outputDir, chunkSize, gameIds, assignmentRows, callRows, challengeRows }) {
  await mkdir(outputDir, { recursive: true });
  const chunks = chunkArray(gameIds, chunkSize);
  const files = [];
  for (const [index, chunkGameIds] of chunks.entries()) {
    const firstGame = chunkGameIds[0] || "empty";
    const lastGame = chunkGameIds[chunkGameIds.length - 1] || "empty";
    const filePath = path.join(outputDir, `${String(index + 1).padStart(3, "0")}-${firstGame}-${lastGame}.sql`);
    await writeFile(filePath, buildIngestSql({
      gameIds: chunkGameIds,
      assignmentRows: rowsForGameIds(assignmentRows, chunkGameIds),
      callRows: rowsForGameIds(callRows, chunkGameIds),
      challengeRows: rowsForGameIds(challengeRows, chunkGameIds),
    }));
    files.push(filePath);
  }
  return files;
}

async function main() {
  const season = readArg("season") || DEFAULT_SEASON;
  const teamId = readArg("team-id") || WIZARDS_TEAM_ID;
  const seasonTypes = readListArg("season-types", DEFAULT_SEASON_TYPES);
  const gameIdsArg = readListArg("game-ids");
  const maxGames = readIntegerArg("max-games", 0);
  const concurrency = readIntegerArg("concurrency", 4);
  const outputPath = readArg("out");
  const sqlOutputPath = readArg("sql-out");
  const sqlOutputDir = readArg("sql-dir");
  const sqlChunkSize = readIntegerArg("sql-chunk-size", 12);
  const discover = hasFlag("discover") || !gameIdsArg.length;

  const discoveredGames = discover
    ? await discoverTeamGameIds({ season, seasonTypes, teamId, maxGames })
    : gameIdsArg.map((gameId) => ({ gameId, seasonType: "", gameDate: "", matchup: "" }));
  const gameRefs = discoveredGames.length ? discoveredGames : DEFAULT_GAME_IDS.map((gameId) => ({ gameId, seasonType: "", gameDate: "", matchup: "" }));
  const errors = [];
  const games = await mapWithConcurrency(gameRefs, concurrency, async (gameRef) => {
    try {
      return { gameRef, game: await fetchGame(gameRef.gameId) };
    } catch (error) {
      errors.push({ gameId: gameRef.gameId, message: error instanceof Error ? error.message : "unknown" });
      return null;
    }
  });
  const loadedGames = games.filter(Boolean);

  const assignmentRows = loadedGames.flatMap(({ game, gameRef }) => buildAssignmentRows(game, gameRef));
  const callRows = loadedGames.flatMap(({ game, gameRef }) => extractOfficialCallEvents(game, {
    season,
    seasonType: gameRef.seasonType,
    gameDate: gameRef.gameDate,
  }).map(toCallRow));
  const challengeRows = loadedGames.flatMap(({ game, gameRef }) => detectCoachChallengeActions(game, {
    season,
    seasonType: gameRef.seasonType,
    gameDate: gameRef.gameDate,
  }).map(toChallengeRow));
  const processedGameIds = loadedGames.map(({ gameRef }) => gameRef.gameId);
  let generatedSqlChunks = [];
  if (sqlOutputDir) {
    generatedSqlChunks = await writeSqlChunks({
      outputDir: sqlOutputDir,
      chunkSize: sqlChunkSize,
      gameIds: processedGameIds,
      assignmentRows,
      callRows,
      challengeRows,
    });
  }
  const report = {
    season,
    teamId,
    seasonTypes,
    gamesRequested: gameRefs.length,
    gamesProcessed: loadedGames.length,
    errors,
    assignments: assignmentRows.length,
    officialCallEvents: callRows.length,
    challengeReplayEvents: challengeRows.length,
    categoryCounts: categoryCounts(callRows),
    confidenceCounts: confidenceCounts(callRows),
    generatedSql: sqlOutputPath || null,
    generatedSqlChunks,
    sample: {
      games: loadedGames.slice(0, 5).map(({ gameRef, game }) => ({
        gameId: gameRef.gameId,
        gameDate: normalizedGameDate(game, gameRef.gameDate),
        matchup: gameRef.matchup,
        seasonType: normalizedSeasonType(game, gameRef.seasonType),
        officials: buildAssignmentRows(game, gameRef).map((official) => official.official_name),
      })),
      assignments: assignmentRows.slice(0, 5),
      officialCallEvents: callRows.slice(0, 5),
      challengeReplayEvents: challengeRows.slice(0, 5),
    },
  };

  if (outputPath) {
    await writeJsonFile(outputPath, {
      report,
      assignmentRows,
      callRows,
      challengeRows,
    });
  }
  if (sqlOutputPath) {
    await writeTextFile(sqlOutputPath, buildIngestSql({
      gameIds: processedGameIds,
      assignmentRows,
      callRows,
      challengeRows,
    }));
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
