import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchNbaGame } from './nbaGame.js';
const id = '0022200701';
const team = (id, advanced = false) => ({ teamId: id, teamName: 'Team', teamTricode: 'ABC', players: [{ personId: 1, statistics: advanced ? { offRating: 110 } : { points: 7 } }], statistics: advanced ? { offRating: 108.9, defRating: 123.1, poss: 90 } : { points: 7 } });
const fixture = url => {
  if (url.pathname.endsWith('/games')) return { scoreboard: { gameDate: '2023-01-22', games: [{ gameId: id, gameStatus: 3, homeTeam: { teamId: 1, score: 7, timeoutsRemaining: 2 }, awayTeam: { teamId: 2, score: 7 } }] } };
  if (url.pathname.endsWith('/boxscore')) { const advanced = url.searchParams.get('measureType') === 'Advanced'; return { gameId: id, homeTeam: team(1, advanced), awayTeam: team(2, advanced), officials: [] }; }
  return { gameId: id, actions: [{ actionNumber: 1 }] };
};
test('combines scoreboard, box score, advanced stats and actions', async () => {
  const result = await fetchNbaGame(id, 'key', async url => ({ ok: true, json: async () => fixture(url) }));
  assert.equal(result.boxScore.home.teamId, 1);
  assert.equal(result.boxScore.home.players[0].points, 7);
  assert.equal(result.boxScore.home.players[0].offensiveRating, 110);
  assert.equal(result.teamStats.home.possessions, 90);
  assert.equal(result.timeouts.home, 2);
  assert.equal(result.playByPlayActions.length, 1);
});
test('missing advanced data does not break a game', async () => {
  const result = await fetchNbaGame(id, 'key', async url => url.searchParams.get('measureType') === 'Advanced' ? { ok: false, status: 404 } : { ok: true, json: async () => fixture(url) });
  assert.equal(result.teamStats.home.possessions, undefined);
  assert.equal(result.feedAvailability.officialPossessions, false);
});
test('rejects a mismatched traditional box score', async () => {
  await assert.rejects(fetchNbaGame(id, 'key', async url => ({ ok: true, json: async () => url.searchParams.get('measureType') === 'Traditional' ? { ...fixture(url), gameId: 'wrong' } : fixture(url) })), /mismatch/);
});

test('accepts empty provider placeholders for games that have not started', async () => {
  const result = await fetchNbaGame(id, 'key', async url => ({ ok: true, json: async () => {
    const data = fixture(url);
    if (url.pathname.endsWith('/games')) data.scoreboard.games[0].gameStatus = 1;
    if (url.pathname.endsWith('/boxscore')) for (const side of ['homeTeam', 'awayTeam']) data[side] = { teamId: 0, players: [], statistics: {} };
    if (url.pathname.endsWith('/pbp')) data.actions = [];
    return data;
  } }));
  assert.equal(result.boxScore.home.teamId, 1);
  assert.deepEqual(result.boxScore.home.players, []);
});

test('period box score uses the requested range and rejects score mismatches', async () => {
  const { fetchNbaSegmentBox } = await import('./nbaGame.js');
  const game = { gameId: id, gameStatus: 3, homeTeam: { teamId: 1, periods: [{ period: 1, score: 7 }] }, awayTeam: { teamId: 2, periods: [{ period: 1, score: 7 }] } };
  const fetcher = async url => {
    assert.equal(url.searchParams.get('rangeType'), '1');
    assert.equal(url.searchParams.get('startPeriod'), '1');
    assert.equal(url.searchParams.get('endPeriod'), '1');
    return { ok: true, json: async () => ({ gameId: id, homeTeam: team(1), awayTeam: team(2) }) };
  };
  const result = await fetchNbaSegmentBox(game, 'Q1', 'key', fetcher);
  assert.equal(result.boxScore.home.totals.points, 7);
  assert.equal(result.segmentDataQuality.source, 'nba-period-boxscore');
  game.homeTeam.periods[0].score = 8;
  await assert.rejects(fetchNbaSegmentBox(game, 'Q1', 'key', fetcher), /does not reconcile/);
  await assert.rejects(fetchNbaSegmentBox(game, 'bogus', 'key', fetcher), /Unsupported/);
});

test('play-by-play recovery validates identity, content and upstream failures', async () => {
  const { fetchNbaPlayByPlay } = await import('./nbaGame.js');
  const action = { actionNumber: 2, period: 1 };
  const fetcher = async (url, options) => {
    assert.equal(url.pathname, '/v0/api/stats/pbp');
    assert.equal(url.searchParams.get('gameId'), id);
    assert.equal(options.headers['X-NBA-Api-Key'], 'key');
    return { ok: true, json: async () => ({ gameId: id, actions: [action] }) };
  };
  assert.deepEqual(await fetchNbaPlayByPlay(id, 'key', fetcher), { game: { gameId: id, actions: [action] } });
  for (const payload of [{ gameId: id, actions: [] }, { gameId: 'wrong', actions: [action] }, { gameId: id, actions: [null] }]) {
    await assert.rejects(fetchNbaPlayByPlay(id, 'key', async () => ({ ok: true, json: async () => payload })), /incomplete|mismatch/);
  }
  await assert.rejects(fetchNbaPlayByPlay(id, 'key', async () => ({ ok: false, status: 503 })), /503/);
});

test('game date comes from Eastern game time, not the response envelope', async () => {
  const { nbaGameDate } = await import('./nbaGame.js');
  assert.equal(nbaGameDate({ gameEt: '2023-01-22T15:00:00', gameTimeUTC: '2023-01-22T20:00:00Z' }), '2023-01-22');
  assert.equal(nbaGameDate({ gameTimeUTC: '2023-01-23T02:00:00Z' }), '2023-01-22');
  assert.equal(nbaGameDate({ gameTimeUTC: '2023-07-11T02:00:00Z' }), '2023-07-10');
  assert.equal(nbaGameDate({ gameCode: '20230122/LACDAL' }), '2023-01-22');
  assert.equal(nbaGameDate({}), undefined);
});
