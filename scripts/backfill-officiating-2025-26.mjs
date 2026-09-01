#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";
import { detectCoachChallengeActions, extractOfficialCallEvents } from "../src/officiatingParser.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const STATS_API_URL = "https://stats.nba.com/stats/leaguegamefinder";
const WIZARDS_TEAM_ID = "1610612764";
const DEFAULT_SEASON = "2025-26";
const DEFAULT_GAME_IDS = ["0042500131"];
const DEFAULT_SEASON_TYPES = ["Regular Season", "Playoffs"];
const EXCLUDED_STAT_SEASON_TYPES = new Set(["preseason"]);
const NBA_TEAM_IDS = [
  "1610612737", "1610612738", "1610612751", "1610612766", "1610612741", "1610612739",
  "1610612742", "1610612743", "1610612765", "1610612744", "1610612745", "1610612754",
  "1610612746", "1610612747", "1610612763", "1610612748", "1610612749", "1610612750",
  "1610612740", "1610612752", "1610612760", "1610612753", "1610612755", "1610612756",
  "1610612757", "1610612758", "1610612759", "1610612761", "1610612762", "1610612764",
];
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

function seasonStartTwoDigit(season) {
  const startYear = String(season || "").split("-")[0] || "";
  return startYear.slice(-2);
}

function gameId(prefix, season, number) {
  return `${prefix}${seasonStartTwoDigit(season)}${String(number).padStart(5, "0")}`;
}

function inferSeasonTypeFromGameId(value) {
  const id = String(value || "");
  if (id.startsWith("001")) return "Preseason";
  if (id.startsWith("002")) return "Regular Season";
  if (id.startsWith("004")) return "Playoffs";
  if (id.startsWith("005")) return "Play-In";
  return "";
}

function generatedLeagueGameRefs({ season, seasonTypes, maxGames }) {
  const wanted = new Set(seasonTypes.map((seasonType) => String(seasonType).toLowerCase()));
  const includeRegular = wanted.size === 0 || wanted.has("regular season");
  const includePlayoffs = wanted.size === 0 || wanted.has("playoffs");
  const includePlayIn = wanted.has("play in") || wanted.has("play-in") || wanted.has("play-in tournament");
  const refs = [];

  if (includeRegular) {
    for (let number = 1; number <= 1230; number += 1) {
      refs.push({ gameId: gameId("002", season, number), seasonType: "Regular Season", gameDate: "", matchup: "" });
    }
  }
  if (includePlayIn) {
    for (let number = 1; number <= 99; number += 1) {
      refs.push({ gameId: gameId("005", season, number), seasonType: "Play-In", gameDate: "", matchup: "" });
    }
  }
  if (includePlayoffs) {
    for (let number = 1; number <= 499; number += 1) {
      refs.push({ gameId: gameId("004", season, number), seasonType: "Playoffs", gameDate: "", matchup: "" });
    }
  }

  return maxGames ? refs.slice(0, maxGames) : refs;
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function writeTextFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonOnce(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`${url} failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJsonOnce(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(750 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchStatsPlayByPlayActions(gameId) {
  const payload = await fetchJson(
    `https://stats.nba.com/stats/playbyplayv3?GameID=${encodeURIComponent(gameId)}&StartPeriod=0&EndPeriod=0`,
    { headers: NBA_REQUEST_HEADERS, timeoutMs: 20_000, retries: 2 }
  );
  return Array.isArray(payload?.game?.actions) ? payload.game.actions : [];
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
    timeoutMs: 30_000,
    retries: 3,
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

async function discoverLeagueGameIds({ season, seasonTypes, teamIds, maxGames, concurrency }) {
  const teamGames = await mapWithConcurrency(teamIds, concurrency, async (teamId) => (
    discoverTeamGameIds({ season, seasonTypes, teamId, maxGames: 0 }).catch((error) => {
      console.warn(`Could not discover games for ${teamId}: ${error.message}`);
      return [];
    })
  ));
  const byGameId = new Map();
  teamGames.flat().forEach((game) => {
    if (!game.gameId || byGameId.has(game.gameId)) return;
    byGameId.set(game.gameId, game);
  });
  const games = [...byGameId.values()].sort((left, right) => {
    const dateCompare = String(left.gameDate || "").localeCompare(String(right.gameDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(left.gameId || "").localeCompare(String(right.gameId || ""));
  });
  return maxGames ? games.slice(0, maxGames) : games;
}

async function fetchGame(gameId, options = {}) {
  try {
    const game = await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`, {
      timeoutMs: 12_000,
      retries: 1,
    });
    const statsActions = options.skipStatsPlayByPlay ? [] : await fetchStatsPlayByPlayActions(gameId).catch(() => []);
    return {
      ...game,
      playByPlayActions: statsActions.length ? statsActions : game.playByPlayActions,
      source: statsActions.length ? `${game.source || "cloudfront"}+stats_playbyplayv3` : game.source,
    };
  } catch (cloudfrontError) {
    const firstMessage = cloudfrontError instanceof Error ? cloudfrontError.message : "CloudFront fetch failed";
    if (firstMessage.includes("failed (404)")) {
      throw new Error(firstMessage);
    }
    try {
      const [boxscorePayload, livePlayByPlayPayload, statsActions] = await Promise.all([
        fetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
          timeoutMs: 12_000,
          retries: 1,
        }),
        fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`, {
          headers: NBA_REQUEST_HEADERS,
          timeoutMs: 12_000,
          retries: 1,
        }),
        options.skipStatsPlayByPlay ? Promise.resolve([]) : fetchStatsPlayByPlayActions(gameId).catch(() => []),
      ]);
      return {
        ...(boxscorePayload.game || {}),
        gameId,
        playByPlayActions: statsActions.length ? statsActions : livePlayByPlayPayload.game?.actions || [],
        source: statsActions.length ? "nba_live_data+stats_playbyplayv3" : "nba_live_data",
      };
    } catch (liveDataError) {
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

function isIncludedStatSeasonType(seasonType) {
  return !EXCLUDED_STAT_SEASON_TYPES.has(String(seasonType || "").trim().toLowerCase());
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
    is_alternate: false,
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
    area: event.sourcePayload?.area || "",
    area_detail: event.sourcePayload?.areaDetail || event.sourcePayload?.area_detail || "",
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
    crew_chief_id: event.crew_chief_id,
    crew_chief_name: event.crew_chief_name,
    whistling_official_id: event.whistling_official_id,
    whistling_official_name: event.whistling_official_name,
    challenge_outcome: event.challengeOutcome,
    matched_action_number: event.matched_action_number ?? event.matchedActionNumber,
    match_confidence: event.match_confidence ?? event.matchConfidence,
    match_reason: event.match_reason ?? event.matchReason,
    challenge_sub_type: event.challenge_sub_type || event.challengeSubType || "",
    review_status: event.review_status || "auto",
    source: event.source,
    source_payload: event.source_payload || event.sourcePayload,
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
    "secondary_category", "charged_team", "benefiting_team", "confidence", "confidence_reason", "area",
    "area_detail", "source_payload",
  ];
  const challengeColumns = [
    "season", "season_type", "game_id", "game_date", "home_team", "away_team", "challenging_team", "period",
    "game_clock", "crew_chief_id", "crew_chief_name", "whistling_official_id", "whistling_official_name",
    "challenge_outcome", "matched_action_number", "match_confidence", "match_reason", "challenge_sub_type",
    "review_status", "source", "source_payload",
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
    `delete from public.nba_coach_challenge_events where game_id = any(${gameIdArray}) and source = 'play_by_play';`,
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
        area: "text",
        area_detail: "text",
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
        crew_chief_id: "text",
        crew_chief_name: "text",
        whistling_official_id: "text",
        whistling_official_name: "text",
        challenge_outcome: "text",
        matched_action_number: "integer",
        match_confidence: "numeric",
        match_reason: "text",
        challenge_sub_type: "text",
        review_status: "text",
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

function groupBy(rows, keyFn) {
  return rows.reduce((groups, row) => {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

function officialKey(row) {
  return String(row.official_id || row.official_name || "").trim();
}

function markAlternateAssignments(assignmentRows, callRows) {
  const assignmentsByGame = groupBy(assignmentRows, (row) => row.game_id);
  const callsByGame = groupBy(callRows, (row) => row.game_id);

  assignmentsByGame.forEach((assignments, gameId) => {
    if (assignments.length <= 3) return;
    const calls = callsByGame.get(gameId) || [];
    const callCounts = calls.reduce((counts, row) => {
      const key = officialKey(row);
      if (!key) return counts;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const zeroCallAssignments = assignments.filter((assignment) => (
      !callCounts[officialKey(assignment)] && !callCounts[assignment.official_name]
    ));
    const alternatesNeeded = assignments.length - 3;
    zeroCallAssignments.slice(0, alternatesNeeded).forEach((assignment) => {
      assignment.is_alternate = true;
    });
  });

  return assignmentRows;
}

function buildGameAuditRows({ loadedGames, assignmentRows, callRows, challengeRows }) {
  const assignmentsByGame = groupBy(assignmentRows, (row) => row.game_id);
  const callsByGame = groupBy(callRows, (row) => row.game_id);
  const challengesByGame = groupBy(challengeRows, (row) => row.game_id);

  return loadedGames.map(({ gameRef, game }) => {
    const gameId = String(gameRef.gameId || game.gameId || "");
    const assignments = assignmentsByGame.get(gameId) || [];
    const calls = callsByGame.get(gameId) || [];
    const challenges = challengesByGame.get(gameId) || [];
    const nonAlternateAssignments = assignments.filter((row) => !row.is_alternate);
    const crewChiefs = assignments.filter((row) => row.role_key === "crewChief");
    const callsByOfficial = calls.reduce((counts, row) => {
      const key = officialKey(row);
      if (!key) return counts;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const assignedOfficialCallCounts = nonAlternateAssignments.map((assignment) => ({
      official_id: assignment.official_id,
      official_name: assignment.official_name,
      calls: callsByOfficial[officialKey(assignment)] || callsByOfficial[assignment.official_name] || 0,
    }));
    const flags = [];
    if (nonAlternateAssignments.length < 3 || nonAlternateAssignments.length > 4) {
      flags.push(`expected-3-or-4-officials-found-${nonAlternateAssignments.length}`);
    }
    if (crewChiefs.length !== 1) flags.push(`expected-1-crew-chief-found-${crewChiefs.length}`);
    if (calls.length < 20) flags.push(`low-game-call-count-${calls.length}`);
    assignedOfficialCallCounts
      .filter((official) => official.calls === 0)
      .forEach((official) => flags.push(`zero-calls-${official.official_name || official.official_id}`));

    return {
      gameId,
      gameDate: normalizedGameDate(game, gameRef.gameDate),
      matchup: gameRef.matchup,
      seasonType: normalizedSeasonType(game, gameRef.seasonType),
      source: game.source || "",
      officials: nonAlternateAssignments.length,
      crewChiefs: crewChiefs.length,
      officialCallEvents: calls.length,
      challengeReplayEvents: challenges.length,
      matchedWhistleChallenges: challenges.filter((row) => row.whistling_official_name).length,
      matchedCrewChiefChallenges: challenges.filter((row) => row.crew_chief_name).length,
      assignedOfficialCallCounts,
      flags,
    };
  });
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
  await assertOutsideWizardsGameWindow("officiating backfill");
  const season = readArg("season") || DEFAULT_SEASON;
  const teamId = readArg("team-id") || WIZARDS_TEAM_ID;
  const league = hasFlag("league");
  const teamIds = readListArg("team-ids", league ? NBA_TEAM_IDS : [teamId]);
  const requestedSeasonTypes = readListArg("season-types", DEFAULT_SEASON_TYPES);
  const seasonTypes = requestedSeasonTypes.filter(isIncludedStatSeasonType);
  if (seasonTypes.length !== requestedSeasonTypes.length) {
    console.error("Ignoring preseason for officiating stat backfill. Preseason challenges can be imported through import-nba-challenge-log.");
  }
  const gameIdsArg = readListArg("game-ids");
  const maxGames = readIntegerArg("max-games", 0);
  const concurrency = readIntegerArg("concurrency", 4);
  const outputPath = readArg("out");
  const sqlOutputPath = readArg("sql-out");
  const sqlOutputDir = readArg("sql-dir");
  const sqlChunkSize = readIntegerArg("sql-chunk-size", 12);
  const discoverConcurrency = readIntegerArg("discover-concurrency", 2);
  const gameIdSource = readArg("game-id-source") || (league ? "generated" : "stats");
  const skipStatsPlayByPlay = hasFlag("skip-stats-playbyplay");
  const discover = hasFlag("discover") || !gameIdsArg.length;

  const discoveredGames = discover && gameIdSource === "generated"
    ? generatedLeagueGameRefs({ season, seasonTypes, maxGames })
    : discover
      ? await discoverLeagueGameIds({ season, seasonTypes, teamIds, maxGames, concurrency: discoverConcurrency })
      : gameIdsArg.map((nextGameId) => ({
        gameId: nextGameId,
        seasonType: inferSeasonTypeFromGameId(nextGameId),
        gameDate: "",
        matchup: "",
      }));
  const gameRefs = (discoveredGames.length ? discoveredGames : DEFAULT_GAME_IDS.map((gameId) => ({ gameId, seasonType: "", gameDate: "", matchup: "" })))
    .filter((gameRef) => isIncludedStatSeasonType(gameRef.seasonType || inferSeasonTypeFromGameId(gameRef.gameId)));
  console.error(`Discovered ${gameRefs.length} games for ${league ? "league" : teamId} via ${gameIdSource}.`);
  const errors = [];
  let processedCount = 0;
  const games = await mapWithConcurrency(gameRefs, concurrency, async (gameRef) => {
    try {
      const loaded = { gameRef, game: await fetchGame(gameRef.gameId, { skipStatsPlayByPlay }) };
      processedCount += 1;
      const completed = processedCount;
      if (completed % 25 === 0 || completed === gameRefs.length) {
        console.error(`Processed ${completed}/${gameRefs.length} games...`);
      }
      return loaded;
    } catch (error) {
      errors.push({ gameId: gameRef.gameId, message: error instanceof Error ? error.message : "unknown" });
      processedCount += 1;
      console.error(`Failed ${gameRef.gameId}: ${error instanceof Error ? error.message : "unknown"}`);
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
  markAlternateAssignments(assignmentRows, callRows);
  const detectedChallengeRows = loadedGames.flatMap(({ game, gameRef }) => detectCoachChallengeActions(game, {
    season,
    seasonType: gameRef.seasonType,
    gameDate: gameRef.gameDate,
  }).map(toChallengeRow));
  const challengeRows = enrichChallengeEventsWithOfficials(detectedChallengeRows, callRows, assignmentRows);
  const processedGameIds = loadedGames.map(({ gameRef }) => gameRef.gameId);
  const gameAudits = buildGameAuditRows({ loadedGames, assignmentRows, callRows, challengeRows });
  const flaggedGames = gameAudits.filter((row) => row.flags.length);
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
    teamId: league ? "league" : teamId,
    teamIds: league ? teamIds : [teamId],
    seasonTypes,
    gamesRequested: gameRefs.length,
    gamesProcessed: loadedGames.length,
    errors,
    assignments: assignmentRows.length,
    officialCallEvents: callRows.length,
    challengeReplayEvents: challengeRows.length,
    flaggedGames: flaggedGames.length,
    auditSummary: {
      lowGameCallCount: flaggedGames.filter((row) => row.flags.some((flag) => flag.startsWith("low-game-call-count"))).length,
      missingThreeOfficials: flaggedGames.filter((row) => row.flags.some((flag) => flag.startsWith("expected-3-officials"))).length,
      missingCrewChief: flaggedGames.filter((row) => row.flags.some((flag) => flag.startsWith("expected-1-crew-chief"))).length,
      zeroCallOfficials: flaggedGames.reduce((total, row) => total + row.flags.filter((flag) => flag.startsWith("zero-calls")).length, 0),
      unmatchedWhistleChallenges: challengeRows.filter((row) => !row.whistling_official_name).length,
      unmatchedCrewChiefChallenges: challengeRows.filter((row) => !row.crew_chief_name).length,
    },
    flaggedGameSamples: flaggedGames.slice(0, 20),
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
      gameAudits: gameAudits.slice(0, 5),
    },
  };

  if (outputPath) {
    await writeJsonFile(outputPath, {
      report,
      gameAudits,
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
