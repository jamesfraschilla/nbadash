const DEFAULT_TIME_ZONE = "America/New_York";

function dateParts(value, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
}

export function dateKeyInTimeZone(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = dateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function recentCompletedDateKeys({
  now = new Date(),
  lookbackDays = 3,
  timeZone = DEFAULT_TIME_ZONE,
} = {}) {
  const today = dateKeyInTimeZone(now, timeZone);
  const cursor = new Date(`${today}T12:00:00Z`);
  const keys = [];
  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const date = new Date(cursor);
    date.setUTCDate(date.getUTCDate() - offset);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function scheduleGames(payload) {
  if (Array.isArray(payload?.games)) return payload.games;
  const gameDates = Array.isArray(payload?.leagueSchedule?.gameDates)
    ? payload.leagueSchedule.gameDates
    : [];
  return gameDates.flatMap((entry) => (Array.isArray(entry?.games) ? entry.games : []));
}

function gameDate(game) {
  return String(
    game?.gameDate
    || game?.gameDateEst
    || game?.gameDateTimeEst
    || game?.gameDateUTC
    || "",
  ).slice(0, 10);
}

function isPreseason(game) {
  const gameId = String(game?.gameId || "");
  const labels = `${game?.seasonType || ""} ${game?.gameLabel || ""} ${game?.gameSubLabel || ""}`.toLowerCase();
  return gameId.startsWith("001") || labels.includes("preseason");
}

export function selectCompletedScheduleGames(payload, {
  dateKeys,
  season = "",
} = {}) {
  const wantedDates = new Set(dateKeys || []);
  const sourceSeason = String(payload?.season || payload?.leagueSchedule?.seasonYear || "");
  if (season && sourceSeason && sourceSeason !== season) return [];

  return scheduleGames(payload)
    .filter((game) => String(game?.gameId || ""))
    .filter((game) => wantedDates.has(gameDate(game)))
    .filter((game) => Number(game?.gameStatus || 0) === 3)
    .filter((game) => !isPreseason(game))
    .map((game) => ({
      gameId: String(game.gameId),
      gameDate: gameDate(game),
      gameStatus: Number(game.gameStatus || 0),
    }))
    .sort((left, right) => left.gameId.localeCompare(right.gameId));
}

export function incompleteGameIds(games, assignmentRows = [], callRows = []) {
  const assignmentCounts = new Map();
  assignmentRows.forEach((row) => {
    if (row?.is_alternate) return;
    const gameId = String(row?.game_id || "");
    assignmentCounts.set(gameId, (assignmentCounts.get(gameId) || 0) + 1);
  });
  const callCounts = new Map();
  callRows.forEach((row) => {
    const gameId = String(row?.game_id || "");
    callCounts.set(gameId, (callCounts.get(gameId) || 0) + 1);
  });

  return games
    .filter((game) => (assignmentCounts.get(game.gameId) || 0) < 3 || (callCounts.get(game.gameId) || 0) < 20)
    .map((game) => game.gameId);
}
