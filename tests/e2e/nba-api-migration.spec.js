import { expect, test } from '@playwright/test';
import { minutesFixture } from '../fixtures/minutesExplorer.js';

test('scoreboard, full game, period, minutes and recovery use the new server contract', async ({ page }) => {
  const { game, minutes } = minutesFixture();
  game.homeTeam = { ...game.homeTeam, teamName: 'Wizards', score: 2 };
  game.awayTeam = { ...game.awayTeam, teamName: 'Hornets', score: 4 };
  game.boxScore.home.totals = { points: 2 };
  game.boxScore.away.totals = { points: 4 };
  game.teamStats = { home: {}, away: {} };
  const calls = [];
  let omitPlayByPlay = false;
  let primaryGameUnavailable = false;
  let primaryPlayByPlayUnavailable = false;
  await page.route('**/functions/v1/scoreboard', route => {
    calls.push('scoreboard'); return route.fulfill({ json: [game] });
  });
  await page.route('**/functions/v1/game-metadata', route => {
    const body = route.request().postDataJSON();
    if (body.minutesGameId) { calls.push('minutes'); return route.fulfill({ json: { minutes } }); }
    if (body.primaryPlayByPlayGameId) {
      calls.push('primary-playbyplay');
      if (primaryPlayByPlayUnavailable) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { game: { gameId: game.gameId, actions: game.playByPlayActions } } });
    }
    if (body.playByPlayGameId) { calls.push('cdn-playbyplay'); return route.fulfill({ json: { game: { gameId: game.gameId, actions: game.playByPlayActions } } }); }
    if ((body.primaryGameId || body.liveGameId)) {
      if (body.primaryGameId && primaryGameUnavailable) { calls.push('primary-failed'); return route.fulfill({ status: 503, json: {} }); }
      if (body.liveGameId) calls.push('cdn-game');
      calls.push(body.segment ? 'segment' : 'game');
      const served = omitPlayByPlay ? { ...game, playByPlayActions: [] } : game;
      return route.fulfill({ json: { game: body.segment ? { ...served, segmentDataQuality: { source: 'nba-period-boxscore' } } : served } });
    }
    return route.fulfill({ status: 400, json: {} });
  });
  await page.route('**/boxscore_*.json', route => route.fulfill({ json: {} }));
  await page.goto('visual-test.html');
  const result = await page.evaluate(async id => {
    const api = await import('/nbadash/src/api.js');
    const list = await api.fetchGamesByDate('2023-01-22');
    const full = await api.fetchGame(id);
    const segment = await api.fetchGame(id, 'Q1');
    const mins = await api.fetchMinutes(id, { game: full });
    return { list: list[0]?.gameId, full: full.gameId, segment: segment.segmentDataQuality?.source, minutes: mins.periods.length, actions: full.playByPlayActions.length };
  }, game.gameId);
  expect(result).toEqual({ list: game.gameId, full: game.gameId, segment: 'nba-period-boxscore', minutes: 1, actions: game.playByPlayActions.length });
  omitPlayByPlay = true;
  const recovered = await page.evaluate(async id => (await (await import('/nbadash/src/api.js')).fetchGame(id)).playByPlayActions.length, game.gameId);
  expect(recovered).toBe(game.playByPlayActions.length);
  primaryPlayByPlayUnavailable = true;
  const cdnRecovered = await page.evaluate(async id => (await (await import('/nbadash/src/api.js')).fetchGame(id)).playByPlayActions.length, game.gameId);
  expect(cdnRecovered).toBe(game.playByPlayActions.length);
  omitPlayByPlay = false;
  primaryGameUnavailable = true;
  const cdnGame = await page.evaluate(async id => (await (await import('/nbadash/src/api.js')).fetchGame(id)).gameId, game.gameId);
  expect(cdnGame).toBe(game.gameId);
  primaryGameUnavailable = false;
  await page.goto(`#/m/${game.gameId}`);
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Q1', { exact: true })).toBeVisible();
  expect(calls).toEqual(expect.arrayContaining(['scoreboard', 'game', 'segment', 'minutes', 'primary-playbyplay', 'cdn-playbyplay', 'primary-failed', 'cdn-game']));
});
