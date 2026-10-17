#!/usr/bin/env node
import { detectCoachChallengeActions } from "../src/officiatingParser.js";
import { aggregateSegmentStats } from "../src/segmentStats.js";

const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const GAME_API = "https://d1rjt2wyntx8o7.cloudfront.net/api/games";
const LIVE_BOXSCORE = "https://cdn.nba.com/static/json/liveData/boxscore";
const KNOWN_ACTION_TYPES = new Set([
  "2pt", "3pt", "block", "ejection", "foul", "freethrow", "game", "heave",
  "instantreplay", "jumpball", "memo", "period", "rebound", "steal",
  "substitution", "timeout", "turnover", "violation",
]);
const REQUIRED_TOTAL_FIELDS = [
  "points", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade",
  "threePointersAttempted", "freeThrowsMade", "freeThrowsAttempted",
  "reboundsTotal", "reboundsOffensive", "assists", "turnovers",
];
const REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Feed Contract Audit)",
};

function readArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || "";
}

async function json(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`${url} failed (${response.status})`);
  return response.json();
}

function scheduleGames(payload) {
  return (payload?.leagueSchedule?.gameDates || []).flatMap((date) => date.games || []);
}

async function auditedGameIds() {
  const explicit = readArg("game-ids").split(",").map((value) => value.trim()).filter(Boolean);
  if (explicit.length) return explicit;
  const schedule = await json(SCHEDULE_URL);
  const completed = scheduleGames(schedule).filter((game) => Number(game?.gameStatus) === 3);
  const latestDate = completed.map((game) => String(game?.gameDateEst || game?.gameDate || "").slice(0, 10)).sort().at(-1);
  return completed
    .filter((game) => String(game?.gameDateEst || game?.gameDate || "").slice(0, 10) === latestDate)
    .map((game) => String(game.gameId));
}

function hasMidrangeContract(line = {}) {
  return (
    "midFieldGoalsMade" in line && "midFieldGoalsAttempted" in line
  ) || (
    "shortMidFieldGoalsMade" in line && "shortMidFieldGoalsAttempted" in line
    && "longMidFieldGoalsMade" in line && "longMidFieldGoalsAttempted" in line
  );
}

function auditGame(game, liveGame) {
  const gameId = String(game?.gameId || "unknown");
  const errors = [];
  const warnings = [];
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  if (!actions.length) errors.push("play-by-play is empty");
  const unexpectedActionTypes = [...new Set(actions
    .map((action) => String(action?.actionType || "").toLowerCase())
    .filter((type) => type && !KNOWN_ACTION_TYPES.has(type)))];
  if (unexpectedActionTypes.length) errors.push(`new action types: ${unexpectedActionTypes.join(", ")}`);

  for (const side of ["home", "away"]) {
    const team = game?.boxScore?.[side];
    if (!team) {
      errors.push(`missing ${side} box score`);
      continue;
    }
    const totals = team.totals || {};
    const missingTotals = REQUIRED_TOTAL_FIELDS.filter((field) => !(field in totals));
    if (missingTotals.length) errors.push(`${side} totals missing: ${missingTotals.join(", ")}`);
    if (!hasMidrangeContract(totals)) errors.push(`${side} totals missing combined and split mid-range fields`);
    (team.players || []).forEach((player) => {
      if (!hasMidrangeContract(player)) {
        errors.push(`${side} player ${player?.personId || "unknown"} missing combined and split mid-range fields`);
      }
    });
  }

  const officials = Array.isArray(liveGame?.officials) ? liveGame.officials : [];
  if (officials.length < 3) errors.push(`live box score has ${officials.length} officials`);
  if (!officials.some((official) => String(official?.assignment || "").toUpperCase() === "OFFICIAL1")) {
    errors.push("live box score has no OFFICIAL1 crew chief assignment");
  }

  const challenges = detectCoachChallengeActions(game);
  if (challenges.some((challenge) => !challenge.challengingTeam)) errors.push("challenge missing team attribution");
  if (challenges.some((challenge) => !challenge.challengeOutcome)) errors.push("challenge missing outcome attribution");
  if (actions.some((action) => String(action?.actionType || "").toLowerCase() === "heave")) {
    warnings.push("heave action type present; possession logic must retain explicit heave handling");
  }

  const basePlayers = [
    ...(game?.boxScore?.away?.players || []).map((player) => ({ ...player, teamId: game?.awayTeam?.teamId })),
    ...(game?.boxScore?.home?.players || []).map((player) => ({ ...player, teamId: game?.homeTeam?.teamId })),
  ];
  const derived = aggregateSegmentStats({
    gameId,
    actions,
    segment: "all",
    minutesData: null,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    basePlayers,
    currentPeriod: game.period,
    currentClock: game.gameClock,
    isLive: false,
  });
  const reconciliationFields = [
    "points", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade",
    "threePointersAttempted", "freeThrowsMade", "freeThrowsAttempted",
    "reboundsOffensive", "assists", "blocks", "steals", "turnovers", "foulsPersonal",
  ];
  for (const side of ["away", "home"]) {
    const team = side === "away" ? game.awayTeam : game.homeTeam;
    const official = game?.boxScore?.[side]?.totals || {};
    const calculated = derived.teamTotals?.[team?.teamId] || {};
    reconciliationFields.forEach((field) => {
      if (Number(official[field] || 0) !== Number(calculated[field] || 0)) {
        errors.push(`${side} ${field} does not reconcile (${calculated[field] || 0} vs ${official[field] || 0})`);
      }
    });
    const playerRebounds = (game?.boxScore?.[side]?.players || [])
      .reduce((sum, player) => sum + Number(player?.reboundsTotal || 0), 0);
    if (Number(calculated.reboundsTotal || 0) !== playerRebounds) {
      errors.push(`${side} player rebounds do not reconcile (${calculated.reboundsTotal || 0} vs ${playerRebounds})`);
    }
  }
  return { gameId, actions: actions.length, challenges: challenges.length, errors, warnings };
}

async function main() {
  const gameIds = await auditedGameIds();
  if (!gameIds.length) throw new Error("No completed games were available for the feed contract audit.");
  const results = [];
  for (const gameId of gameIds) {
    const [game, liveBoxscore] = await Promise.all([
      json(`${GAME_API}/${gameId}`),
      json(`${LIVE_BOXSCORE}/boxscore_${gameId}.json`),
    ]);
    results.push(auditGame(game, liveBoxscore?.game));
  }
  const report = {
    games: results.length,
    actions: results.reduce((sum, result) => sum + result.actions, 0),
    challenges: results.reduce((sum, result) => sum + result.challenges, 0),
    failures: results.filter((result) => result.errors.length),
    warnings: results.filter((result) => result.warnings.length),
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
