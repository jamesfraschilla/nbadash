export function isWashingtonGame(game) {
  return [game?.homeTeam, game?.awayTeam].some((team) => String(team?.teamId) === "1610612764"
    || String(team?.teamTricode || "").toUpperCase() === "WAS");
}
const easternTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York", hourCycle: "h23",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function timecode(milliseconds) {
  const parts = easternTime.formatToParts(new Date(milliseconds));
  return ["hour", "minute", "second"].map((type) => parts.find((part) => part.type === type).value).join("") + "00";
}

export function nbaClipsUrl(gameId, action) {
  if (!/^00\d{8}$/.test(String(gameId))) return null;
  const timestamp = String(action?.timeActual || "");
  // Require an explicit timezone; never interpret an ambiguous browser-local time.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return null;
  const instant = Date.parse(timestamp);
  if (!Number.isFinite(instant)) return null;
  const params = new URLSearchParams({
    gameNo: String(gameId),
    inTime: timecode(instant - 10_000),
    outTime: timecode(instant + 10_000),
    source: "grs",
  });
  return `https://clips.nba.com/?${params}`;
}

export function washingtonEventClipUrl(game, action) {
  if (!isWashingtonGame(game)) return null;
  const direct = nbaClipsUrl(game.gameId, action);
  if (direct) return direct;
  if (!action?.clock || !action?.period) return null;
  const matching = (game.playByPlayActions || []).find((event) => Number(event.period) === Number(action.period)
    && event.clock === action.clock && nbaClipsUrl(game.gameId, event));
  return matching ? nbaClipsUrl(game.gameId, matching) : null;
}
