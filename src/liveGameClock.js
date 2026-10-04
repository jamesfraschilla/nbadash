import { normalizeClock } from "./utils.js";

const isPeriodEnd = (action) => (
  String(action?.actionType || "").toLowerCase() === "period"
  && String(action?.subType || "").toLowerCase() === "end"
  && /^0+:00$/.test(normalizeClock(String(action?.clock || "")))
);

/**
 * Some venues expose the intermission countdown through gameClock. Once the
 * play-by-play confirms that a period ended, that countdown is not game time.
 */
export function resolveLivePeriodBreak(game) {
  if (Number(game?.gameStatus || 0) !== 2) return null;

  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  const completedPeriods = actions
    .filter(isPeriodEnd)
    .map((action) => Number(action?.period || 0))
    .filter((period) => period >= 1 && period <= 3);
  if (!completedPeriods.length) return null;

  const completedPeriod = Math.max(...completedPeriods);
  const nextPeriodHasStarted = actions.some(
    (action) => Number(action?.period || 0) > completedPeriod
  );
  if (nextPeriodHasStarted) return null;

  return {
    completedPeriod,
    status: completedPeriod === 2 ? "Halftime" : `Q${completedPeriod}`,
    clock: completedPeriod === 2 ? null : "0:00",
  };
}

export function completedPeriodElapsedSeconds(completedPeriod, regulationPeriodSeconds = 12 * 60) {
  const safeCompletedPeriod = Math.max(0, Number(completedPeriod) || 0);
  return Math.min(safeCompletedPeriod, 4) * regulationPeriodSeconds;
}
