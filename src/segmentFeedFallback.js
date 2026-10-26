import { aggregateSegmentStats } from "./segmentStats.js";

export function needsThreeQuarterFallback(game, segment) {
  if (String(segment).toUpperCase() !== "Q1-Q3") return false;
  if (Number(game?.gameStatus) < 2) return false;
  return ["home", "away"].some((side) => {
    const teamId = String(game?.[`${side}Team`]?.teamId || "");
    const hasScoring = (game?.playByPlayActions || []).some((action) => Number(action.period) >= 1
      && Number(action.period) <= 3 && String(action.teamId) === teamId
      && ["2pt", "3pt", "freethrow"].includes(action.actionType) && action.shotResult === "Made");
    return !game?.boxScore?.[side]?.players?.length
      || (hasScoring && !(Number(game?.boxScore?.[side]?.totals?.points) > 0));
  });
}

export function rebuildThreeQuarterFeed(segmentGame, fullGame) {
  if (String(segmentGame?.gameId) !== String(fullGame?.gameId)) throw new Error("Segment fallback game identity mismatch.");
  const actions = fullGame.playByPlayActions || [];
  if (!actions.length) throw new Error("Q1–Q3 stats are unavailable: full play-by-play is missing.");
  const basePlayers = ["home", "away"].flatMap((side) => (fullGame.boxScore?.[side]?.players || [])
    .map((player) => ({ ...player, teamId: fullGame[`${side}Team`].teamId })));
  const stats = aggregateSegmentStats({ gameId: fullGame.gameId, actions, segment: "q1-q3",
    homeTeam: fullGame.homeTeam, awayTeam: fullGame.awayTeam, basePlayers, minutesData: null,
    currentPeriod: fullGame.period, currentClock: fullGame.gameClock, isLive: Number(fullGame.gameStatus) === 2 });
  const boxScore = Object.fromEntries(["home", "away"].map((side) => [side, {
    ...fullGame.boxScore?.[side],
    totals: stats.teamTotals[fullGame[`${side}Team`].teamId],
    players: (fullGame.boxScore?.[side]?.players || []).map((player) => ({
      ...player,
      ...(stats.playerMap.get(player.personId) || stats.playerMap.get(Number(player.personId)) || {}),
    })),
  }]));
  return { ...segmentGame, playByPlayActions: actions, boxScore,
    // Never borrow full-game advanced ratings for a partial-game segment.
    teamStats: { home: {}, away: {} },
    segmentDataQuality: { source: "play-by-play", reason: "Empty Q1–Q3 endpoint repaired from full game" } };
}
