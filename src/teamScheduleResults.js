import { formatDateInputInTimeZone } from "./utils.js";

// The bundled season schedule provides fixtures, not authoritative results.
// Share small daily-scoreboard requests across teams and opponent filters.
export function createTeamScheduleResultsLoader(fetchDate, { now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const loadDate = async (date) => {
    const cached = cache.get(date);
    if (cached && cached.expiresAt > now()) return cached.games;
    if (pending.has(date)) return pending.get(date);
    const request = Promise.resolve().then(() => fetchDate(date)).then((games) => {
      const list = Array.isArray(games) ? games : [];
      const final = list.length > 0 && list.every((game) => Number(game.gameStatus) === 3);
      cache.set(date, { games: list, expiresAt: now() + (final ? 6 * 60 * 60_000 : 30_000) });
      if (cache.size > 400) cache.delete(cache.keys().next().value);
      return list;
    }).catch(() => {
      // Never convert an unavailable scoreboard into a final or a zero score.
      cache.set(date, { games: [], expiresAt: now() + 30_000 });
      return [];
    }).finally(() => pending.delete(date));
    pending.set(date, request);
    return request;
  };

  return async (games) => {
    const today = formatDateInputInTimeZone(new Date(now()), "America/New_York");
    const dates = [...new Set(games.filter((game) => Number(game.gameStatus) !== 3
      && game.gameDate && game.gameDate <= today).map((game) => game.gameDate))];
    const results = new Map();
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, dates.length) }, async () => {
      while (index < dates.length) {
        const date = dates[index++];
        for (const game of await loadDate(date)) results.set(String(game.gameId), game);
      }
    }));
    return games.map((game) => {
      if (Number(game.gameStatus) === 3) return game;
      const result = results.get(String(game.gameId));
      if (!result || ![2, 3].includes(Number(result.gameStatus))) return game;
      return {
        ...game,
        ...result,
        gameDate: game.gameDate,
        seasonType: result.seasonType || game.seasonType,
        arena: { ...game.arena, ...result.arena },
        homeTeam: { ...game.homeTeam, ...result.homeTeam },
        awayTeam: { ...game.awayTeam, ...result.awayTeam },
      };
    });
  };
}
