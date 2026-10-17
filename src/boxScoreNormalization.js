function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasStat(line, key) {
  return Object.prototype.hasOwnProperty.call(line || {}, key)
    && line[key] != null
    && Number.isFinite(Number(line[key]));
}

export function normalizeMidrangeStatLine(line) {
  if (!line || typeof line !== "object") return line;
  const made = hasStat(line, "midFieldGoalsMade")
    ? numericValue(line.midFieldGoalsMade)
    : numericValue(line.shortMidFieldGoalsMade) + numericValue(line.longMidFieldGoalsMade);
  const attempted = hasStat(line, "midFieldGoalsAttempted")
    ? numericValue(line.midFieldGoalsAttempted)
    : numericValue(line.shortMidFieldGoalsAttempted) + numericValue(line.longMidFieldGoalsAttempted);
  return {
    ...line,
    midFieldGoalsMade: made,
    midFieldGoalsAttempted: attempted,
  };
}

function normalizeBoxScoreTeam(team) {
  if (!team || typeof team !== "object") return team;
  return {
    ...team,
    totals: normalizeMidrangeStatLine(team.totals),
    players: Array.isArray(team.players)
      ? team.players.map(normalizeMidrangeStatLine)
      : team.players,
  };
}

export function normalizeGameMidrangeStats(game) {
  if (!game?.boxScore) return game;
  return {
    ...game,
    boxScore: {
      ...game.boxScore,
      away: normalizeBoxScoreTeam(game.boxScore.away),
      home: normalizeBoxScoreTeam(game.boxScore.home),
    },
  };
}
