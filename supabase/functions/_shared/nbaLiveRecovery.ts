type RecordValue = Record<string, any>;
function verifyFinalScore(game: RecordValue, actions: RecordValue[]) {
  if (Number(game.gameStatus) !== 3) return;
  // Corrections to earlier quarters can be appended with larger order numbers
  // after Game End. Period and countdown clock define game chronology first.
  const remaining = (action: RecordValue) => {
    const match = String(action.clock || "").match(/^PT(?:(\d+)M)?([\d.]+)S$/);
    return match ? Number(match[1] || 0) * 60 + Number(match[2]) : 0;
  };
  const scored = [...actions].sort((a, b) => Number(b.period || 0) - Number(a.period || 0)
    || remaining(a) - remaining(b)
    || Number(b.orderNumber ?? b.actionNumber ?? 0) - Number(a.orderNumber ?? a.actionNumber ?? 0))
    .find(a => [a.scoreHome, a.scoreAway].every(v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))));
  if (!scored || Number(scored.scoreHome) !== Number(game.homeTeam.score) || Number(scored.scoreAway) !== Number(game.awayTeam.score)) throw new Error("Final scores do not reconcile");
}
// NBA liveData is not identical to our API contract. Map explicitly; do not
// invent advanced stats that the backup cannot supply.
export function normalizeNbaLiveRecovery(gameId: string, box: RecordValue, pbp: RecordValue) {
  const game = box?.game;
  if (String(game?.gameId) !== gameId || String(pbp?.game?.gameId) !== gameId) throw new Error("Backup game identity mismatch");
  const actions = pbp.game.actions;
  if (!game.homeTeam?.teamId || !game.awayTeam?.teamId || !Array.isArray(actions) || (Number(game.gameStatus) >= 2 && !actions.length)) throw new Error("Backup game incomplete");
  const line = (stats: RecordValue = {}) => ({ ...stats, reboundsTotal: stats.reboundsPersonal ?? stats.reboundsTotal });
  const teams = Object.fromEntries(["home", "away"].map(side => {
    const team = game[`${side}Team`];
    if (!Array.isArray(team.players) || !team.players.length || !team.statistics) throw new Error("Backup box score incomplete");
    return [side, { totals: line(team.statistics), players: team.players.map((p: RecordValue) => ({
      ...p, ...line(p.statistics), jerseyNum: p.jerseyNum, starter: p.starter,
    })) }];
  }));
  const result: RecordValue = { ...game, boxScore: teams, playByPlayActions: actions, teamStats: { home: {}, away: {} },
    feedAvailability: { source: "nba-live-backup", reason: "Primary game feed unavailable", limited: true } };
  // Refuse clearly mismatched final PBP/box snapshots. Live snapshots can race.
  verifyFinalScore(game, actions);
  return result;
}

async function fetchNbaLiveSources(gameId: string, fetcher: typeof fetch = fetch) {
  if (!/^\d{10}$/.test(gameId)) throw new Error("Invalid game ID");
  const load = async (kind: string) => {
    const response = await fetcher(`https://cdn.nba.com/static/json/liveData/${kind}/${kind}_${gameId}.json`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0", Referer: "https://www.nba.com/" }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`NBA ${kind} unavailable (${response.status})`);
    return response.json();
  };
  const [box, pbp] = await Promise.all([load("boxscore"), load("playbyplay")]);
  return {box,pbp};
}

export async function fetchNbaLiveRecovery(gameId: string, fetcher: typeof fetch = fetch) {
  const {box,pbp}=await fetchNbaLiveSources(gameId,fetcher);
  return normalizeNbaLiveRecovery(gameId, box, pbp);
}

// Server-side reconciliation uses the same alternate source as the dashboard.
// Preserve primary derived fields when only PBP was omitted. A backup-only game
// remains explicitly limited and must not be represented as primary coverage.
export async function fetchRecoverableGame(gameId: string, fetcher: typeof fetch = fetch) {
  if (!/^\d{10}$/.test(gameId)) throw new Error("Invalid game ID");
  let primary: RecordValue | null = null;
  try {
    const response = await fetcher(`https://d1rjt2wyntx8o7.cloudfront.net/api/games/${gameId}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Primary unavailable (${response.status})`);
    primary = await response.json();
    if (String(primary?.gameId) !== gameId || !primary?.homeTeam?.teamId || !primary?.awayTeam?.teamId || !primary?.boxScore) throw new Error("Primary identity incomplete");
    if (Number(primary.gameStatus) === 1) return primary;
    if (Array.isArray(primary.playByPlayActions) && primary.playByPlayActions.length) {
      verifyFinalScore(primary, primary.playByPlayActions);
      return primary;
    }
  } catch { primary = null; }
  const {box,pbp}=await fetchNbaLiveSources(gameId,fetcher);
  if (!primary) return normalizeNbaLiveRecovery(gameId,box,pbp);
  // CDN box snapshots can lag a final score correction while primary box and
  // CDN PBP agree. Validate PBP against the primary we will actually preserve;
  // never relax the backup-only final-score guard or mix different teams.
  if (String(box?.game?.gameId)!==gameId || String(pbp?.game?.gameId)!==gameId
    || ["homeTeam","awayTeam"].some(side=>String(primary![side].teamId)!==String(box?.game?.[side]?.teamId)))
    throw new Error("Backup game identity mismatch");
  const actions=pbp.game.actions;
  if (!Array.isArray(actions) || !actions.length) throw new Error("Backup game incomplete");
  if (Number(primary.gameStatus)!==3 && (Number(primary.homeTeam.score)!==Number(box.game.homeTeam.score)
    || Number(primary.awayTeam.score)!==Number(box.game.awayTeam.score))) throw new Error("Primary and backup scores do not reconcile");
  verifyFinalScore(primary,actions);
  return { ...primary, playByPlayActions: actions,
    feedAvailability: { source: "nba-pbp-backup", limited: false } };
}
