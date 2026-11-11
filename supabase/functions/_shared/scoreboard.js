const SUMMER_LEAGUES = ['13', '14', '15', '16'];
export async function fetchScoreboard(date, apiKey, leagues = null, fetcher = fetch) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid game date');
  if (!apiKey) throw new Error('NBA_API_KEY is not configured');
  const required = leagues ?? ['00', '20'];
  // Preserve NBA/G League availability if an optional Summer League feed is
  // unavailable. The browser retains its existing Summer League fallback.
  const optional = leagues == null && ['06', '07', '08'].includes(date.slice(5, 7)) ? SUMMER_LEAGUES : [];
  const load = async league => {
    const url = new URL('https://api.nba.com/v0/api/scores/scoreboard/date');
    url.searchParams.set('leagueId', league);
    url.searchParams.set('gameDate', date);
    const response = await fetcher(url, { headers: { 'X-NBA-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Scoreboard ${league} failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload?.scoreboard?.games)) throw new Error(`Invalid scoreboard response for ${league}`);
    return payload.scoreboard.games.map(game => ({ ...game, gameDate: date }));
  };
  const [primary, summer] = await Promise.all([Promise.all(required.map(load)), Promise.allSettled(optional.map(load))]);
  const games = [...primary.flat(), ...summer.flatMap(result => result.status === 'fulfilled' ? result.value : [])];
  return [...new Map(games.map(game => [String(game.gameId), game])).values()];
}
