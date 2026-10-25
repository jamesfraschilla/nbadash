// One-night cohort only. Keep historical prepared recaps accessible afterwards.
export const LIVE_AUDIT_GAMES = Object.freeze([
  { gameId: "0022600112", matchup: "Lakers at Jazz", slug: "lal-vs-uta", tipUtc: "2026-10-25T21:00:00Z" },
  { gameId: "0022600117", matchup: "Pistons at 76ers", slug: "det-vs-phi", tipUtc: "2026-10-25T23:30:00Z" },
  { gameId: "0022600118", matchup: "Grizzlies at Kings", slug: "mem-vs-sac", tipUtc: "2026-10-26T01:00:00Z" },
]);

export function isLiveAuditGame(gameId) {
  return LIVE_AUDIT_GAMES.some((game) => game.gameId === String(gameId));
}
