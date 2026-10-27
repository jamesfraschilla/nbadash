// Deliberately restricted until video timecodes are validated across games.
export const NBA_CLIPS_TRIAL_GAME_ID = "0022600119";
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

export function nbaClipsTrialUrl(gameId, action) {
  return String(gameId) === NBA_CLIPS_TRIAL_GAME_ID ? nbaClipsUrl(gameId, action) : null;
}
