export function shouldUseDirectSummerLeagueGame(game) {
  if (!game || typeof game !== "object") return false;
  if (!game.boxScore || !game.teamStats) return false;

  if (Number(game.gameStatus) === 1) {
    return true;
  }

  return Array.isArray(game.playByPlayActions) && game.playByPlayActions.length > 0;
}
