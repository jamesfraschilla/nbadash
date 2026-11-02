const player = (personId) => ({ personId, nameI: `P. Player${personId}` });
export function minutesFixture() {
  const away = [1, 2, 3, 4, 5].map(player), home = [11, 12, 13, 14, 15].map(player);
  const minutes = { gameId: "0022600015", gameStatus: 2,
    awayTeam: { teamId: 1, teamTricode: "CHA", teamName: "Charlotte", score: 4 },
    homeTeam: { teamId: 2, teamTricode: "WAS", teamName: "Washington", score: 2 },
    periods: [{ period: 1, periodLabel: "Q1", stints: [
      { startClock: "12:00", endClock: "6:00", plusMinus: -1, awayScore: 3, homeScore: 2, playersAway: away, playersHome: home },
      { startClock: "6:00", endClock: "0:00", plusMinus: -1, awayScore: 1, homeScore: 0, playersAway: [player(6), ...away.slice(1)], playersHome: home },
    ] }] };
  const events = [
    { clock: "12:00", actionType: "period", subType: "start" },
    { clock: "10:00", teamId: 2, actionType: "2pt", shotResult: "Made" },
    { clock: "6:00", teamId: 1, actionType: "3pt", shotResult: "Made" },
    { clock: "6:00", teamId: 1, actionType: "substitution", subType: "out", personId: 1 },
    { clock: "6:00", teamId: 1, actionType: "substitution", subType: "in", personId: 6 },
    { clock: "6:00", teamId: 1, actionType: "freethrow", shotResult: "Made" },
    { clock: "0:00", actionType: "period", subType: "end" },
  ].map((event, index) => ({ ...event, period: 1, actionNumber: index + 1, orderNumber: index + 1 }));
  const game = { ...minutes, period: 1, gameClock: "PT00M00.00S", playByPlayActions: events,
    boxScore: {
      away: { players: [{ personId: 1, fieldGoalsAttempted: 1, fieldGoalsMade: 1, threePointersMade: 1, freeThrowsAttempted: 1 }] },
      home: { players: [{ personId: 11, fieldGoalsAttempted: 1, fieldGoalsMade: 1, threePointersMade: 0, freeThrowsAttempted: 0 }] },
    } };
  return { minutes, game };
}
