#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { CALL_CATEGORY_GROUPS, isCountedTechnicalEvent, normalizeOfficialCallCategory, shootingFoulLocationSubtype } from "../src/officiatingCategoryNormalization.js";

const PAGE_SIZE = 1000;
const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Insight Facts)",
};
const FOUL_CATEGORIES = new Set(
  (CALL_CATEGORY_GROUPS.find((group) => group.key === "fouls")?.types || [])
    .flatMap((type) => type.labels || [])
);

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  });
}

async function loadEnv() {
  await loadEnvFile(path.resolve(".env"));
  await loadEnvFile(path.resolve(".env.local"));
}

function supabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function selectAll(client, table, select, configure) {
  const rows = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let query = client.from(table).select(select).range(start, start + PAGE_SIZE - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
  }
  return rows;
}

async function selectAllIfPresent(client, table, select, configure) {
  try {
    return await selectAll(client, table, select, configure);
  } catch (error) {
    if (/relation .* does not exist|could not find the table/i.test(String(error?.message || error))) return [];
    throw error;
  }
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  return Math.round(number(value));
}

function minutesNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value || "");
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(text);
  if (iso) return number(iso[1]) + number(iso[2]) / 60;
  const clock = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (clock) return number(clock[1]) + number(clock[2]) / 60;
  return number(value);
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function seasonTypeAllowed(value) {
  return ["regular season", "playoffs"].includes(String(value || "").trim().toLowerCase());
}

async function fetchBoxscore(gameId, attempts = 3) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers: NBA_HEADERS });
    if (response.ok) return response.json();
    if (attempt === attempts) throw new Error(`${gameId}: boxscore request failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw new Error(`${gameId}: boxscore unavailable`);
}

function teamFactRows(payload, assignment, season) {
  const game = payload?.game || {};
  const home = game.homeTeam || {};
  const away = game.awayTeam || {};
  const gameDate = String(game.gameTimeLocal || game.gameTimeUTC || game.gameEt || assignment.game_date || "").slice(0, 10);
  return [[home, away, "home"], [away, home, "away"]].map(([team, opponent, homeAway]) => {
    const stats = team.statistics || {};
    const fga = integer(stats.fieldGoalsAttempted);
    const oreb = integer(stats.reboundsOffensive);
    const turnovers = integer(stats.turnovers);
    const fta = integer(stats.freeThrowsAttempted);
    const row = {
      season,
      season_type: assignment.season_type,
      game_id: assignment.game_id,
      game_date: gameDate || assignment.game_date,
      team_id: String(team.teamId || ""),
      team: String(team.teamTricode || "").toUpperCase(),
      opponent_team_id: String(opponent.teamId || ""),
      opponent: String(opponent.teamTricode || "").toUpperCase(),
      home_away: homeAway,
      won: number(team.score) > number(opponent.score),
      minutes: minutesNumber(stats.minutes),
      points: integer(team.score ?? stats.points),
      opponent_points: integer(opponent.score ?? opponent.statistics?.points),
      possessions_estimate: fga - oreb + turnovers + 0.44 * fta,
      field_goals_attempted: fga,
      three_pointers_attempted: integer(stats.threePointersAttempted),
      free_throws_attempted: fta,
      rebounds_offensive: oreb,
      turnovers,
      personal_fouls: integer(stats.foulsPersonal),
      technical_fouls: integer(stats.foulsTechnical),
      points_in_paint: integer(stats.pointsInThePaint),
      points_fast_break: integer(stats.pointsFastBreak),
      points_second_chance: integer(stats.pointsSecondChance),
      source: "nba_live_boxscore",
      source_version: "v1",
      completeness_status: team.teamId && team.teamTricode ? "complete" : "incomplete",
      updated_at: new Date().toISOString(),
    };
    return { ...row, source_hash: hash(row) };
  });
}

function playerFactRows(payload, assignment, season) {
  const game = payload?.game || {};
  const teams = [game.homeTeam || {}, game.awayTeam || {}];
  const gameDate = String(game.gameTimeLocal || game.gameTimeUTC || game.gameEt || assignment.game_date || "").slice(0, 10);
  return teams.flatMap((team, index) => {
    const opponent = teams[index === 0 ? 1 : 0];
    return (Array.isArray(team.players) ? team.players : []).map((player) => {
      const stats = player.statistics || {};
      const row = {
        season,
        season_type: assignment.season_type,
        game_id: assignment.game_id,
        game_date: gameDate || assignment.game_date,
        team_id: String(team.teamId || ""),
        team: String(team.teamTricode || "").toUpperCase(),
        opponent: String(opponent.teamTricode || "").toUpperCase(),
        player_id: String(player.personId || ""),
        player_name: String(player.name || `${player.firstName || ""} ${player.familyName || ""}`).trim(),
        minutes: minutesNumber(stats.minutes),
        points: integer(stats.points),
        field_goals_attempted: integer(stats.fieldGoalsAttempted),
        three_pointers_attempted: integer(stats.threePointersAttempted),
        free_throws_attempted: integer(stats.freeThrowsAttempted),
        rebounds_offensive: integer(stats.reboundsOffensive),
        assists: integer(stats.assists),
        turnovers: integer(stats.turnovers),
        personal_fouls: integer(stats.foulsPersonal),
        technical_fouls: integer(stats.foulsTechnical),
        points_in_paint: integer(stats.pointsInThePaint),
        source: "nba_live_boxscore",
        source_version: "v1",
        completeness_status: player.personId ? "complete" : "incomplete",
        updated_at: new Date().toISOString(),
      };
      return { ...row, source_hash: hash(row) };
    });
  });
}

function officialFactRows(assignments, calls, season) {
  const callsByOfficialGame = new Map();
  calls.forEach((call) => {
    const key = `${call.game_id}|${call.official_id}`;
    const group = callsByOfficialGame.get(key) || [];
    group.push(call);
    callsByOfficialGame.set(key, group);
  });
  return assignments.map((assignment) => {
    const rows = callsByOfficialGame.get(`${assignment.game_id}|${assignment.official_id}`) || [];
    const categoryCounts = {};
    const teamNetCalls = {};
    let fouls = 0;
    let violations = 0;
    let technicals = 0;
    rows.forEach((call) => {
      const category = normalizeOfficialCallCategory(call);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      const locationSubtype = shootingFoulLocationSubtype(call, category);
      if (locationSubtype) categoryCounts[locationSubtype] = (categoryCounts[locationSubtype] || 0) + 1;
      if (FOUL_CATEGORIES.has(category)) fouls += 1;
      else violations += 1;
      if (isCountedTechnicalEvent(call)) technicals += 1;
      const charged = String(call.charged_team || "").trim().toUpperCase();
      const benefiting = String(call.benefiting_team || "").trim().toUpperCase();
      if (charged) teamNetCalls[charged] = (teamNetCalls[charged] || 0) - 1;
      if (benefiting) teamNetCalls[benefiting] = (teamNetCalls[benefiting] || 0) + 1;
    });
    return {
      season,
      season_type: assignment.season_type,
      game_id: assignment.game_id,
      game_date: assignment.game_date,
      home_team: assignment.home_team,
      away_team: assignment.away_team,
      official_id: String(assignment.official_id),
      official_name: assignment.official_name,
      role_key: assignment.role_key,
      assignment_order: assignment.assignment_order,
      is_alternate: Boolean(assignment.is_alternate),
      calls: rows.length,
      fouls,
      violations,
      technicals,
      category_counts: categoryCounts,
      team_net_calls: teamNetCalls,
      source_version: "v1",
      completeness_status: "complete",
      updated_at: new Date().toISOString(),
    };
  });
}

async function upsertChunks(client, table, rows, onConflict) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function main() {
  await loadEnv();
  const apply = hasFlag("apply");
  const includePlayers = hasFlag("include-players");
  const officialsOnly = hasFlag("officials-only");
  const replace = hasFlag("replace");
  const season = readArg("season", "2025-26");
  const maxGames = Math.max(0, integer(readArg("max-games", "0")));
  const concurrency = Math.max(1, Math.min(6, integer(readArg("concurrency", "3"))));
  const lookbackDays = Math.max(0, integer(readArg("lookback-days", "0")));
  if (apply) await assertOutsideWizardsGameWindow();
  const client = supabaseClient();
  const assignments = await selectAll(client, "nba_official_game_assignments", "season,season_type,game_id,game_date,home_team,away_team,official_id,official_name,role_key,assignment_order,is_alternate", (query) => query
    .eq("season", season)
    .not("season_type", "ilike", "Preseason")
    .order("game_date", { ascending: true }));
  const validAssignments = assignments.filter((row) => seasonTypeAllowed(row.season_type));
  const assignmentByGame = new Map(validAssignments.map((row) => [row.game_id, row]));
  let gameIds = [...assignmentByGame.keys()];
  if (lookbackDays) {
    const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    gameIds = gameIds.filter((gameId) => String(assignmentByGame.get(gameId)?.game_date || "") >= cutoff);
  }
  if (!replace && !officialsOnly) {
    const existing = await selectAllIfPresent(client, "nba_team_game_facts", "game_id", (query) => query.eq("season", season));
    const existingIds = new Set(existing.map((row) => row.game_id));
    gameIds = gameIds.filter((gameId) => !existingIds.has(gameId));
  }
  if (maxGames) gameIds = gameIds.slice(0, maxGames);

  const gameSet = new Set(gameIds);
  const selectedAssignments = validAssignments.filter((row) => gameSet.has(row.game_id));
  const calls = (await Promise.all(chunks(gameIds, 100).map((gameIdChunk) => selectAll(
    client,
    "nba_official_call_events",
    "season,season_type,game_id,official_id,primary_category,secondary_category,sub_type,descriptor,charged_team,benefiting_team,area,area_detail",
    (query) => query.eq("season", season).in("game_id", gameIdChunk).not("season_type", "ilike", "Preseason")
  )))).flat();

  console.log(JSON.stringify({ season, games: gameIds.length, assignments: selectedAssignments.length, calls: calls.length, apply, includePlayers, officialsOnly }, null, 2));
  if (!gameIds.length) return;
  if (!apply) {
    console.log(`Dry run only. Add --apply to ${officialsOnly ? "write official facts" : "fetch box scores and write facts"}.`);
    return;
  }

  if (officialsOnly) {
    const officialRows = officialFactRows(selectedAssignments, calls, season);
    await upsertChunks(client, "nba_official_game_facts", officialRows, "game_id,official_id");
    console.log(JSON.stringify({ insertedOfficialFacts: officialRows.length }, null, 2));
    return;
  }

  const fetched = await mapWithConcurrency(gameIds, concurrency, async (gameId, index) => {
    const payload = await fetchBoxscore(gameId);
    if ((index + 1) % 25 === 0 || index + 1 === gameIds.length) console.log(`Fetched ${index + 1}/${gameIds.length} box scores`);
    const assignment = assignmentByGame.get(gameId);
    return {
      teamRows: teamFactRows(payload, assignment, season),
      playerRows: includePlayers ? playerFactRows(payload, assignment, season) : [],
    };
  });
  const teamRows = fetched.flatMap((result) => result.teamRows);
  const playerRows = fetched.flatMap((result) => result.playerRows);
  const officialRows = officialFactRows(selectedAssignments, calls, season);
  await upsertChunks(client, "nba_team_game_facts", teamRows, "game_id,team_id");
  await upsertChunks(client, "nba_official_game_facts", officialRows, "game_id,official_id");
  if (playerRows.length) await upsertChunks(client, "nba_player_game_facts", playerRows, "game_id,player_id");
  console.log(JSON.stringify({ insertedTeamFacts: teamRows.length, insertedOfficialFacts: officialRows.length, insertedPlayerFacts: playerRows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
