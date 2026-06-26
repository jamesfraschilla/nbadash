import { format } from "date-fns";

export function formatDateInput(date) {
  return format(date, "yyyy-MM-dd");
}

export function formatDateInputInTimeZone(date = new Date(), timeZone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function currentSeasonString(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function parseSeasonStartYear(season) {
  const match = /^(\d{4})-\d{2}$/.exec(String(season || "").trim());
  return match ? Number(match[1]) : null;
}

export function seasonBoundsForSeason(season = currentSeasonString(), date = new Date()) {
  const startYear = parseSeasonStartYear(season);
  if (!Number.isFinite(startYear)) {
    throw new Error(`Invalid season: ${season}`);
  }
  const seasonStart = new Date(startYear, 9, 1);
  const seasonEnd = new Date(startYear + 1, 5, 30);
  const end = date >= seasonStart && date < seasonEnd ? date : seasonEnd;
  return {
    start: seasonStart,
    end: date < seasonStart ? new Date(seasonStart.getFullYear(), seasonStart.getMonth(), seasonStart.getDate() - 1) : end,
  };
}

export function parseDateInput(value) {
  if (!value) return new Date();
  const parts = value.split("-");
  if (parts.length !== 3) return new Date(value);
  const [year, month, day] = parts.map((part) => Number(part));
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
}

export function formatDateLabel(date) {
  return format(date, "M/d/yy");
}

export function formatGameDateLabel(value) {
  if (!value) return "";
  try {
    const parts = String(value).split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts.map((part) => Number(part));
      return format(new Date(year, month - 1, day), "M/d/yy");
    }
    return format(new Date(value), "M/d/yy");
  } catch {
    return String(value || "");
  }
}

export function formatTipTime(gameTimeUtc, fallback) {
  try {
    return format(new Date(gameTimeUtc), "h:mm a");
  } catch {
    return fallback || "TBD";
  }
}

export function normalizeClock(clock) {
  if (!clock) return "";
  if (!clock.startsWith("PT")) return clock;
  const match = clock.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return clock;
  const minutes = match[1] || "0";
  const seconds = Math.floor(parseFloat(match[2] || "0"));
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function gameStatusLabel(game) {
  const statusText = (game.gameStatusText || "").toLowerCase();
  const isFinal = game.gameStatus === 3 || statusText.includes("final");
  const isLive = game.gameStatus === 2;

  if (isFinal) {
    if (game.period > 4) {
      const ot = game.period - 4;
      return ot === 1 ? "F/OT" : `F/OT${ot}`;
    }
    return "F";
  }

  if (statusText.includes("halftime")) return "HT";

  if (statusText.includes("end of") || statusText.includes("end q")) {
    if (game.period > 4) {
      const ot = game.period - 4;
      return ot === 1 ? "OT" : `${ot}OT`;
    }
    return `End Q${game.period}`;
  }

  if (isLive) {
    const clock = normalizeClock(game.gameClock);
    if (clock === "0:00" || game.gameClock === "PT0S") {
      if (game.period === 2) return "HT";
      if (game.period === 4) return "End Q4";
      if (game.period > 4) {
        const ot = game.period - 4;
        return ot === 1 ? "OT" : `${ot}OT`;
      }
      return `End Q${game.period}`;
    }
    if (game.period <= 4) return `Q${game.period}`;
    const ot = game.period - 4;
    return ot === 1 ? "OT" : `${ot}OT`;
  }

  return null;
}

export function formatMinutes(duration) {
  if (!duration) return "";
  if (!duration.startsWith("PT")) return duration;
  const match = duration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return duration;
  const minutes = match[1] || "0";
  const seconds = Math.floor(parseFloat(match[2] || "0"));
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
