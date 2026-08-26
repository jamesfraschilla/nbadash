#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { extractOfficialCallEvents, detectCoachChallengeActions } from "../src/officiatingParser.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const DEFAULT_GAME_IDS = ["0042500131"];

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function readListArg(name, fallback = []) {
  const value = readArg(name);
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function fetchGame(gameId) {
  const response = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Game ${gameId} failed (${response.status})`);
  }
  return response.json();
}

function categoryCounts(events) {
  return events.reduce((counts, event) => {
    const key = event.primaryCategory || "unknown_official_event";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function confidenceCounts(events) {
  return events.reduce((counts, event) => {
    const bucket = event.confidence >= 0.9
      ? "high"
      : event.confidence >= 0.7
        ? "medium"
        : "low";
    counts[bucket] = (counts[bucket] || 0) + 1;
    return counts;
  }, { high: 0, medium: 0, low: 0 });
}

function buildAssignmentRows(game) {
  const officials = Array.isArray(game.officials) ? game.officials : [];
  return officials.map((official, index) => ({
    season: String(game.seasonYear || "2025-26"),
    season_type: String(game.seasonType || ""),
    game_id: String(game.gameId || ""),
    game_date: String(game.gameEt || game.gameTimeUTC || "").slice(0, 10) || null,
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
  }));
}

function toCallRow(event) {
  return {
    season: event.season || "2025-26",
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
    confidence: event.confidence,
    confidence_reason: event.confidenceReason,
    source_payload: event.sourcePayload,
  };
}

function toChallengeRow(event) {
  return {
    season: event.season || "2025-26",
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

async function main() {
  const gameIds = readListArg("game-ids", DEFAULT_GAME_IDS);
  const outputPath = readArg("out");
  const games = [];
  const errors = [];

  for (const gameId of gameIds) {
    try {
      games.push(await fetchGame(gameId));
    } catch (error) {
      errors.push({ gameId, message: error instanceof Error ? error.message : "unknown" });
    }
  }

  const assignmentRows = games.flatMap(buildAssignmentRows);
  const callRows = games.flatMap((game) => extractOfficialCallEvents(game).map(toCallRow));
  const challengeRows = games.flatMap((game) => detectCoachChallengeActions(game).map(toChallengeRow));
  const report = {
    season: "2025-26",
    gamesRequested: gameIds.length,
    gamesProcessed: games.length,
    errors,
    assignments: assignmentRows.length,
    officialCallEvents: callRows.length,
    challengeReplayEvents: challengeRows.length,
    categoryCounts: categoryCounts(callRows.map((row) => ({
      primaryCategory: row.primary_category,
    }))),
    confidenceCounts: confidenceCounts(callRows.map((row) => ({
      confidence: Number(row.confidence || 0),
    }))),
    sample: {
      assignments: assignmentRows.slice(0, 5),
      officialCallEvents: callRows.slice(0, 5),
      challengeReplayEvents: challengeRows.slice(0, 5),
    },
  };

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify({
      report,
      assignmentRows,
      callRows,
      challengeRows,
    }, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
