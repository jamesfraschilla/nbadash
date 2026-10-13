import { aggregateSegmentStats } from "./segmentStats.js";

export function buildCompletedPeriodSnapshots(game) {
  const actions = game?.playByPlayActions || [];
  const completed = [...new Set(actions.filter((a) => a.actionType === "period" && a.subType === "end").map((a) => Number(a.period)))];
  const snapshots = [];
  for (const period of completed) {
    const end = actions.filter((a) => Number(a.period) === period && a.actionType === "period" && a.subType === "end").at(-1);
    const totals = aggregateSegmentStats({ gameId: game.gameId, actions: actions.filter((a) => Number(a.period) <= period), segment: "all", minutesData: null,
      homeTeam: game.homeTeam, awayTeam: game.awayTeam, basePlayers: [], currentPeriod: period, currentClock: "0:00", isLive: false }).teamTotals;
    for (const side of ["home", "away"]) {
      const teamId = String(game[`${side}Team`]?.teamId || "");
      const rawScore = end?.[side === "home" ? "scoreHome" : "scoreAway"];
      const score = Number(rawScore);
      if (!teamId || rawScore == null || rawScore === "" || !Number.isFinite(score) || totals[teamId]?.points !== score) {
        throw new Error(`Cannot verify ${game.gameId} ${side} cumulative score through period ${period}.`);
      }
      snapshots.push({ game_id: game.gameId, period, team_id: teamId, totals: { ...totals[teamId], _captureVersion: 2 } });
    }
  }
  return snapshots;
}
