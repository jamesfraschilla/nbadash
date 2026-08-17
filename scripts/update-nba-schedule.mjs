import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEDULE_API_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const DEFAULT_SEASON = "2026-27";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatScheduleDate(value) {
  const raw = String(value || "").trim();
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (isoMatch) return isoMatch[1];

  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (!usMatch) return "";
  return `${usMatch[3]}-${String(usMatch[1]).padStart(2, "0")}-${String(usMatch[2]).padStart(2, "0")}`;
}

function inferScheduleSeasonType(game) {
  const gameId = String(game?.gameId || "");
  const label = `${String(game?.gameLabel || "")} ${String(game?.gameSubLabel || "")}`.toLowerCase();
  if (gameId.startsWith("001") || label.includes("preseason")) return "Preseason";
  if (gameId.startsWith("004") || label.includes("playoff")) return "Playoffs";
  return "Regular Season";
}

function normalizeNbaCupInfo(game) {
  const gameLabel = String(game?.gameLabel || "").trim();
  const gameSubLabel = String(game?.gameSubLabel || "").trim();
  const gameSubtype = String(game?.gameSubtype || "").trim();
  const providedIsCup = game?.isNbaCup === true || String(game?.isNbaCup || "").toLowerCase() === "true";
  const cupText = `${gameLabel} ${gameSubLabel} ${gameSubtype}`.toLowerCase();
  const isNbaCup = providedIsCup || cupText.includes("nba cup") || cupText.includes("in-season");
  let nbaCupStage = String(game?.nbaCupStage || "").trim();
  let nbaCupGroup = String(game?.nbaCupGroup || "").trim();

  if (isNbaCup && !nbaCupStage) {
    if (/championship/i.test(gameSubLabel)) {
      nbaCupStage = "Championship";
    } else if (/semifinal/i.test(gameSubLabel)) {
      nbaCupStage = "Semifinal";
    } else if (/quarterfinal/i.test(gameSubLabel)) {
      nbaCupStage = "Quarterfinal";
    } else {
      nbaCupStage = "Group Play";
    }
  }

  if (isNbaCup && !nbaCupGroup && /\bgroup\b/i.test(gameSubLabel)) {
    nbaCupGroup = gameSubLabel;
  }

  return {
    gameLabel,
    gameSubLabel,
    gameSubtype,
    isNbaCup,
    nbaCupStage,
    nbaCupGroup,
  };
}

function buildScheduleTeamPayload(team) {
  return {
    teamId: toNumber(team?.teamId, 0),
    teamName: String(team?.teamName || "").trim(),
    teamCity: String(team?.teamCity || "").trim(),
    teamTricode: String(team?.teamTricode || "").trim(),
    wins: Number.isFinite(Number(team?.wins)) ? toNumber(team?.wins, 0) : null,
    losses: Number.isFinite(Number(team?.losses)) ? toNumber(team?.losses, 0) : null,
    score: toNumber(team?.score, 0),
    timeoutsRemaining: 0,
  };
}

function normalizeScheduleGame(game, season) {
  return {
    gameId: String(game?.gameId || ""),
    gameCode: String(game?.gameCode || ""),
    gameStatus: toNumber(game?.gameStatus, 1),
    gameStatusText: String(game?.gameStatusText || ""),
    period: 0,
    gameClock: "",
    gameTimeUTC: String(game?.gameDateTimeUTC || game?.gameTimeUTC || ""),
    gameEt: String(game?.gameDateTimeEst || game?.gameTimeEst || ""),
    seasonYear: season,
    seasonType: inferScheduleSeasonType(game),
    ...normalizeNbaCupInfo(game),
    gameDate: formatScheduleDate(game?.gameDateEst || game?.gameDateTimeEst || game?.gameDateUTC),
    arena: {
      arenaName: String(game?.arenaName || "").trim(),
      arenaState: String(game?.arenaState || "").trim(),
      arenaCity: String(game?.arenaCity || "").trim(),
    },
    homeTeam: buildScheduleTeamPayload(game?.homeTeam),
    awayTeam: buildScheduleTeamPayload(game?.awayTeam),
  };
}

function compareGamesSoonestFirst(left, right) {
  const dateCompare = String(left.gameDate || "").localeCompare(String(right.gameDate || ""));
  if (dateCompare !== 0) return dateCompare;
  return String(left.gameId || "").localeCompare(String(right.gameId || ""));
}

async function main() {
  const season = String(process.argv[2] || DEFAULT_SEASON).trim();
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("Usage: node scripts/update-nba-schedule.mjs 2026-27");
  }

  const response = await fetch(SCHEDULE_API_URL, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.nba.com/schedule",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Schedule Updater)",
    },
  });
  if (!response.ok) {
    throw new Error(`Schedule request failed (${response.status})`);
  }

  const payload = await response.json();
  const sourceSeason = String(payload?.leagueSchedule?.seasonYear || "").trim();
  if (sourceSeason !== season) {
    throw new Error(`NBA schedule feed is for ${sourceSeason || "unknown season"}, not ${season}.`);
  }

  const gameDates = Array.isArray(payload?.leagueSchedule?.gameDates)
    ? payload.leagueSchedule.gameDates
    : [];
  const games = gameDates
    .flatMap((dateRecord) => (Array.isArray(dateRecord?.games) ? dateRecord.games : []))
    .map((game) => normalizeScheduleGame(game, season))
    .filter((game) => game.gameId && game.gameDate)
    .sort(compareGamesSoonestFirst);

  const generatedAt = new Date().toISOString();
  const schedulePayload = { season, generatedAt, games };
  const cupPayload = {
    season,
    generatedAt,
    games: games
      .filter((game) => game.isNbaCup)
      .map((game) => ({
        gameId: game.gameId,
        gameLabel: game.gameLabel,
        gameSubLabel: game.gameSubLabel,
        gameSubtype: game.gameSubtype,
        isNbaCup: game.isNbaCup,
        nbaCupStage: game.nbaCupStage,
        nbaCupGroup: game.nbaCupGroup,
      })),
  };

  const seasonToken = season.replace("-", "_");
  const scheduleJson = `${JSON.stringify(schedulePayload)}\n`;
  await fs.writeFile(path.join(repoRoot, "src", "data", `nbaSchedule${seasonToken}.json`), scheduleJson);
  await fs.writeFile(path.join(repoRoot, "supabase", "functions", "team-games", `nbaSchedule${seasonToken}.json`), scheduleJson);
  await fs.writeFile(
    path.join(repoRoot, "src", "data", `nbaCupGames${seasonToken}.json`),
    `${JSON.stringify(cupPayload)}\n`,
  );

  console.log(`Wrote ${games.length} games and ${cupPayload.games.length} NBA Cup entries for ${season}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
