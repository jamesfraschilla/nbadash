export function isSummerLeagueGameId(gameId) {
  return /^1(?:3|4|5|6)\d{8}$/.test(String(gameId || "").trim());
}

export function shouldUseDirectSummerLeagueGame(game) {
  if (!game || typeof game !== "object") return false;
  if (!game.boxScore || !game.teamStats) return false;

  if (Number(game.gameStatus) === 1) {
    return true;
  }

  return Array.isArray(game.playByPlayActions) && game.playByPlayActions.length > 0;
}

function parseClockSeconds(clock) {
  const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(clock || "").trim());
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function formatClockSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function periodLengthSeconds(period) {
  return Number(period) > 4 ? 5 * 60 : 10 * 60;
}

function clampSummerLeagueClock(clock, period) {
  const parsed = parseClockSeconds(clock);
  if (parsed == null) return clock;
  const capped = Math.min(parsed, periodLengthSeconds(period));
  return capped === parsed ? clock : formatClockSeconds(capped);
}

export function normalizeSummerLeagueMinutesData(gameId, data) {
  if (!isSummerLeagueGameId(gameId) || !data || typeof data !== "object") {
    return data;
  }

  return {
    ...data,
    periods: Array.isArray(data.periods)
      ? data.periods.map((periodEntry) => {
        const period = Number(periodEntry?.period) || 0;
        return {
          ...periodEntry,
          stints: Array.isArray(periodEntry?.stints)
            ? periodEntry.stints.map((stint) => ({
              ...stint,
              startClock: clampSummerLeagueClock(stint?.startClock, period),
              endClock: clampSummerLeagueClock(stint?.endClock, period),
            }))
            : periodEntry?.stints,
        };
      })
      : data.periods,
  };
}
