const BASE = 'https://api.nba.com/v0/api';

// Game dates follow the NBA's Eastern game calendar, not the envelope date,
// which can represent the day the by-game response was requested.
export function nbaGameDate(game) {
  const eastern = String(game?.gameEt || '').trim();
  const localDate = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(eastern)?.[1];
  if (localDate) return localDate;
  const time = Date.parse(String(game?.gameTimeUTC || game?.gameTimeUtc || ''));
  if (Number.isFinite(time)) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
  const code = /^(\d{4})(\d{2})(\d{2})\//.exec(String(game?.gameCode || ''));
  return code ? `${code[1]}-${code[2]}-${code[3]}` : undefined;
}

export async function fetchNbaGame(gameId, apiKey, fetcher = fetch, { allowMissingPbp = false } = {}) {
  if (!/^\d{10}$/.test(gameId)) throw new Error('Invalid game ID');
  if (!apiKey) throw new Error('NBA_API_KEY is not configured');
  const leagueId = gameId.slice(0, 2);
  const load = async (path, params) => {
    const url = new URL(`${BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetcher(url, { headers: { 'X-NBA-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`NBA ${path} unavailable (${response.status})`);
    return response.json();
  };
  const [scoreboard, box, pbp] = await Promise.all([
    load('scores/scoreboard/games', { leagueId, gameId }),
    load('stats/boxscore', { gameId, measureType: 'Traditional' }),
    load('stats/pbp', { gameId }),
  ]);
  const card = scoreboard?.scoreboard?.games?.find(game => String(game.gameId) === gameId);
  if (!card || String(box?.gameId) !== gameId || String(pbp?.gameId) !== gameId || !Array.isArray(pbp.actions)) throw new Error('NBA game identity or play-by-play mismatch');
  // The provider documents advanced box scores as postgame data. Treat missing
  // or mismatched advanced responses as optional; traditional live data must work.
  let advanced = null;
  if (Number(card.gameStatus) === 3) {
    try {
      const candidate = await load('stats/boxscore', { gameId, measureType: 'Advanced' });
      if (String(candidate?.gameId) === gameId && ['home', 'away'].every(side =>
        String(candidate[`${side}Team`]?.teamId) === String(card[`${side}Team`]?.teamId))) advanced = candidate;
    } catch { /* Advanced metrics are optional. */ }
  }
  const boxScore = {};
  const teamStats = {};
  for (const side of ['home', 'away']) {
    const team = box[`${side}Team`];
    if (!team || !Array.isArray(team.players) || !team.statistics) throw new Error('NBA box score incomplete');
    const cardTeam = card[`${side}Team`];
    const isPregamePlaceholder = Number(card.gameStatus) === 1 && Number(team.teamId) === 0 && team.players.length === 0;
    if (!cardTeam?.teamId || (!isPregamePlaceholder && String(team.teamId) !== String(cardTeam.teamId))) throw new Error('NBA box score incomplete');
    const line = stats => ({ ...stats, reboundsTotal: stats?.reboundsPersonal ?? stats?.reboundsTotal });
    const advancedTeam = advanced?.[`${side}Team`];
    const playersById = new Map((advancedTeam?.players || []).map(p => [String(p.personId), p.statistics || {}]));
    const stats = advancedTeam?.statistics || {};
    const finite = value => value != null && Number.isFinite(Number(value)) ? Number(value) : undefined;
    teamStats[side] = { offensiveRating: finite(stats.offRating), defensiveRating: finite(stats.defRating),
      netRating: finite(stats.netRating), possessions: finite(stats.poss) };
    boxScore[side] = { teamId: cardTeam.teamId, teamName: team.teamName || cardTeam.teamName, teamTricode: team.teamTricode || cardTeam.teamTricode,
      totals: line(team.statistics), players: team.players.map(p => {
        const a = playersById.get(String(p.personId)) || {};
        return { ...p, ...line(p.statistics || {}), offensiveRating: finite(a.offRating),
          defensiveRating: finite(a.defRating), netRating: finite(a.netRating) };
      }) };
  }
  if (Number(card.gameStatus) >= 2 && !pbp.actions.length && !allowMissingPbp) throw new Error('NBA play-by-play incomplete');
  return { ...card, gameDate: nbaGameDate(card), boxScore, playByPlayActions: pbp.actions,
    officials: box.officials || [], teamStats,
    timeouts: { home: card.homeTeam?.timeoutsRemaining, away: card.awayTeam?.timeoutsRemaining },
    feedAvailability: { source: 'nba-api', limited: true, playByPlay: pbp.actions.length > 0,
      officialPossessions: ['home', 'away'].every(side => Number.isFinite(teamStats[side].possessions) && teamStats[side].possessions > 0) } };
}

const SEGMENT_PERIODS = { Q1: [1, 1], Q2: [2, 2], Q3: [3, 3], Q4: [4, 4], '1H': [1, 2], '2H': [3, 4], 'Q1-Q3': [1, 3] };
export async function fetchNbaSegmentBox(game, segment, apiKey, fetcher = fetch) {
  const range = SEGMENT_PERIODS[String(segment).toUpperCase()];
  if (!range) throw new Error('Unsupported game segment');
  if (Number(game?.gameStatus) !== 3) throw new Error('Official segment box score is only available after the game');
  if (!apiKey) throw new Error('NBA_API_KEY is not configured');
  const url = new URL(`${BASE}/stats/boxscore`);
  for (const [key, value] of Object.entries({ gameId: game.gameId, measureType: 'Traditional', rangeType: '1', startPeriod: String(range[0]), endPeriod: String(range[1]) })) url.searchParams.set(key, value);
  const response = await fetcher(url, { headers: { 'X-NBA-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`NBA segment unavailable (${response.status})`);
  const box = await response.json();
  if (String(box?.gameId) !== String(game.gameId)) throw new Error('Segment game identity mismatch');
  const result = {};
  for (const side of ['home', 'away']) {
    const team = box[`${side}Team`];
    if (!team || String(team.teamId) !== String(game[`${side}Team`]?.teamId) || !Array.isArray(team.players) || !team.statistics) throw new Error('Segment box score incomplete');
    const line = stats => ({ ...stats, reboundsTotal: stats?.reboundsPersonal ?? stats?.reboundsTotal });
    const expected = game[`${side}Team`]?.periods;
    const periods = Array.isArray(expected) ? expected.filter(p => Number(p.period) >= range[0] && Number(p.period) <= range[1]) : [];
    if (periods.length === range[1] - range[0] + 1 && periods.every(p => p.score != null && Number.isFinite(Number(p.score))) && Number(team.statistics.points) !== periods.reduce((sum, p) => sum + Number(p.score), 0)) throw new Error('Segment score does not reconcile');
    result[side] = { teamId: team.teamId, teamName: team.teamName, teamTricode: team.teamTricode,
      totals: line(team.statistics), players: team.players.map(player => ({ ...player, ...line(player.statistics || {}) })) };
  }
  return { ...game, boxScore: result, teamStats: { home: {}, away: {} }, segmentDataQuality: { source: 'nba-period-boxscore' } };
}

export async function fetchNbaPlayByPlay(gameId, apiKey, fetcher = fetch) {
  if (!/^\d{10}$/.test(gameId)) throw new Error('Invalid game ID');
  if (!apiKey) throw new Error('NBA_API_KEY is not configured');
  const url = new URL(`${BASE}/stats/pbp`);
  url.searchParams.set('gameId', gameId);
  const response = await fetcher(url, { headers: { 'X-NBA-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`NBA play-by-play unavailable (${response.status})`);
  const payload = await response.json();
  if (String(payload?.gameId) !== gameId || !Array.isArray(payload?.actions) || !payload.actions.length
    || payload.actions.some(action => !action || typeof action !== 'object' || Array.isArray(action))) throw new Error('NBA play-by-play incomplete or game identity mismatch');
  return { game: { gameId, actions: payload.actions } };
}
