// Explicit, date-bounded audit cohort. Keep historical recaps accessible afterwards.
export const LIVE_AUDIT_GAMES = Object.freeze([
  { gameId: "0022600112", matchup: "Lakers at Jazz", slug: "lal-vs-uta", tipUtc: "2026-10-25T21:00:00Z" },
  { gameId: "0022600117", matchup: "Pistons at 76ers", slug: "det-vs-phi", tipUtc: "2026-10-25T23:30:00Z" },
  { gameId: "0022600118", matchup: "Grizzlies at Kings", slug: "mem-vs-sac", tipUtc: "2026-10-26T01:00:00Z" },
  { gameId: "0022600119", matchup: "Wizards at Hornets", slug: "was-vs-cha", tipUtc: "2026-10-26T23:00:00Z" },
]);

export function isLiveAuditGame(gameId) {
  return LIVE_AUDIT_GAMES.some((game) => game.gameId === String(gameId));
}

export function auditStartPlan(gameId, now = Date.now(), dryRun = false) {
  const game = LIVE_AUDIT_GAMES.find((item) => item.gameId === String(gameId));
  if (!game) throw new Error("Game is not in the approved audit cohort.");
  const tip = Date.parse(game.tipUtc);
  const startsAt = tip - 15 * 60_000;
  if (!dryRun && now >= tip + 5 * 60 * 60_000) throw new Error("Audit window has expired.");
  if (!dryRun && startsAt - now > 345 * 60_000) throw new Error("Arm this audit within 5 hours 45 minutes of its start.");
  return { gameId: game.gameId, startsAt: dryRun ? now : Math.max(now, startsAt) };
}

export function auditCoverage(firstCapture, livePeriods, finalPeriod = 4) {
  const missingLivePeriods = Array.from({ length: Math.max(4, finalPeriod) }, (_, index) => index + 1)
    .filter((period) => !livePeriods.includes(period));
  const startedPregame = Number(firstCapture?.status) === 1;
  return { startedPregame, missingLivePeriods, complete: startedPregame && !missingLivePeriods.length };
}
