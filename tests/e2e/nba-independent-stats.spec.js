import { expect, test } from '@playwright/test';
import { minutesFixture } from '../fixtures/minutesExplorer.js';

test('NBA API play-by-play restores the detailed dashboard with labeled possession estimates', async ({ page }) => {
  const { game, minutes } = minutesFixture();
  game.feedAvailability = { source: 'nba-api', limited: true, playByPlay: true };
  game.teamStats = { home: {}, away: {} };
  game.playByPlayActions = [
    { actionNumber: 1, orderNumber: 1, period: 1, clock: 'PT11M30S', possession: 1, teamId: 1, actionType: '2pt', shotDistance: 5, shotResult: 'Made', scoreHome: 0, scoreAway: 2 },
    { actionNumber: 2, orderNumber: 2, period: 1, clock: 'PT11M00S', possession: 2, teamId: 2, actionType: '2pt', shotDistance: 12, shotResult: 'Made', scoreHome: 2, scoreAway: 2 },
  ];
  for (const side of ['home', 'away']) game.boxScore[side].totals = {
    points: side === 'home' ? 2 : 4, fieldGoalsMade: 1, fieldGoalsAttempted: 2,
    threePointersMade: side === 'home' ? 0 : 1, threePointersAttempted: 1,
    freeThrowsAttempted: 1, reboundsOffensive: 1, reboundsTotal: 3,
    pointsSecondChance: 2, pointsFromTurnovers: 0, pointsInThePaint: 2,
  };
  await page.route('**/scoreboard', route => route.fulfill({ json: [game] }));
  await page.route('**/game-metadata', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: body.minutesGameId ? { minutes } : { game } });
  });
  await page.route('**/boxscore_*.json', route => route.fulfill({ json: {} }));
  await page.goto(`/#/g/${game.gameId}`);
  await expect(page.getByRole('heading', { name: 'Four Factors' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shot Profile' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shot Efficiency' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transition' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Misc' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Creating' })).toBeVisible();
  await expect(page.getByText('3P Rate', { exact: true })).toBeVisible();
  await expect(page.getByText('3P FG%', { exact: true })).toBeVisible();
  await expect(page.getByText('TOV%', { exact: true })).toBeVisible();
  await expect(page.getByText('Possession Game (est.)', { exact: true })).toBeVisible();
  await expect(page.getByText(/^PACE \(est\.\)/)).toBeVisible();
});

test('postgame outcome rates remain distinct from official NBA possessions', async ({ page }) => {
  const { game, minutes } = minutesFixture();
  game.gameId = '0022600217';
  minutes.gameId = game.gameId;
  game.gameStatus = 3;
  game.period = 4;
  minutes.gameStatus = 3;
  game.feedAvailability = { source: 'nba-api', limited: true, playByPlay: true, officialPossessions: true };
  game.teamStats = { home: { possessions: 96 }, away: { possessions: 96 } };
  game.playByPlayActions = [
    { actionNumber: 1, orderNumber: 1, period: 1, clock: 'PT11M30S', possession: 1, teamId: 1, actionType: '2pt', shotDistance: 5, shotResult: 'Made', scoreHome: 0, scoreAway: 2 },
    { actionNumber: 2, orderNumber: 2, period: 1, clock: 'PT11M00S', possession: 2, teamId: 2, actionType: '2pt', shotDistance: 12, shotResult: 'Made', scoreHome: 2, scoreAway: 2 },
  ];
  for (const side of ['home', 'away']) game.boxScore[side].totals = { points: 2, fieldGoalsMade: 1, fieldGoalsAttempted: 1, reboundsOffensive: 0, reboundsTotal: 0, turnovers: 0 };
  await page.route('**/scoreboard', route => route.fulfill({ json: [game] }));
  await page.route('**/game-metadata', route => route.fulfill({ json: route.request().postDataJSON().minutesGameId ? { minutes } : { game } }));
  await page.route('**/boxscore_*.json', route => route.fulfill({ json: {} }));
  await page.goto(`/#/g/${game.gameId}`);
  await expect(page.getByText('Possession Game (est.)', { exact: true })).toBeVisible();
  await expect(page.getByText(/^PACE \(est\.\)/)).toBeVisible();
  await expect(page.getByText(/NBA Advanced counts 96 CHA and 96 WAS possessions/)).toBeVisible();
});
