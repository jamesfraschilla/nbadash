// Narrow, reviewed corrections for source records where both NBA play-by-play
// feeds omit data that cannot be inferred safely. Keep this list explicit so
// daily integrity checks expose new omissions instead of silently guessing.
const CHALLENGE_TEAM_CORRECTIONS = new Map([
  ["0012600028|2|PT05M07.00S", "SAC"],
]);

export function correctedChallengeTeam(gameId, period, clock) {
  return CHALLENGE_TEAM_CORRECTIONS.get(`${gameId}|${period}|${clock}`) || "";
}
