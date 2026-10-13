// NBA feed team rebounds can include dead-ball/team rebounds. Our segment
// statistic is player rebounds, so use the same definition for full games.
export function normalizeTeamRebounds(totals, players) {
  if (!players?.length || !Number.isFinite(Number(totals?.points))) return totals || {};
  const points = players.reduce((sum, player) => sum + Number(player.points || 0), 0);
  if (points !== Number(totals.points)) return totals;
  const fields = ["reboundsTotal", "reboundsOffensive"];
  const normalized = { ...totals };
  for (const field of fields) {
    if (players.every((player) => Number.isFinite(Number(player[field])))) {
      normalized[field] = players.reduce((sum, player) => sum + Number(player[field]), 0);
    }
  }
  return normalized;
}

export function findIncompletePersonalFoulFeed(boxScore, computedTotals) {
  return ["home", "away"].flatMap((side) => {
    const team = boxScore?.[side];
    const official = Number(team?.totals?.foulsPersonal);
    const derived = Number(computedTotals?.[team?.teamId]?.foulsPersonal);
    return Number.isFinite(official) && Number.isFinite(derived) && official !== derived
      ? [`${team.teamTricode || team.teamName || side}: the box score has ${official} personal fouls, but play-by-play accounts for ${derived}. Quarter foul totals may be incomplete.`]
      : [];
  });
}
