import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchScoreboard } from './scoreboard.js';
test('maps and combines league scoreboards without exposing credentials', async () => {
  const calls = [];
  const result = await fetchScoreboard('2023-01-22', 'secret', ['00', '20'], async (url, opts) => {
    calls.push([url.searchParams.get('leagueId'), opts.headers['X-NBA-Api-Key']]);
    return { ok: true, json: async () => ({ scoreboard: { gameDate: '2023-01-22', games: [{ gameId: url.searchParams.get('leagueId') }] } }) };
  });
  assert.deepEqual(calls, [['00', 'secret'], ['20', 'secret']]);
  assert.deepEqual(result.map(g => [g.gameId, g.gameDate]), [['00', '2023-01-22'], ['20', '2023-01-22']]);
});
test('rejects malformed and failed upstream responses', async () => {
  await assert.rejects(fetchScoreboard('bad', 'key'), /Invalid game date/);
  await assert.rejects(fetchScoreboard('2023-01-22', 'key', ['00'], async () => ({ ok: true, json: async () => ({}) })), /Invalid scoreboard/);
  await assert.rejects(fetchScoreboard('2023-01-22', 'key', ['00'], async () => ({ ok: false, status: 403 })), /403/);
});
test('loads summer leagues when in season and tolerates optional feed failure', async () => {
  const calls = [];
  const result = await fetchScoreboard('2026-07-10', 'key', null, async url => {
    const league = url.searchParams.get('leagueId'); calls.push(league);
    if (league === '14') return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ scoreboard: { games: [{ gameId: `${league}22600001` }] } }) };
  });
  assert.deepEqual(calls.sort(), ['00', '13', '14', '15', '16', '20']);
  assert.equal(result.length, 5);
  assert.equal(result.some(game => game.gameId === '1522600001'), true);
});

test('date scoreboard preserves the requested game date rather than envelope metadata', async () => {
  const result = await fetchScoreboard('2023-01-22', 'key', ['00'], async () => ({ ok: true, json: async () => ({ scoreboard: { gameDate: '2026-11-11', games: [{ gameId: '0022200701' }] } }) }));
  assert.equal(result[0].gameDate, '2023-01-22');
});
