import { expect, test } from '@playwright/test';
import { minutesFixture } from '../fixtures/minutesExplorer.js';

test('NBA API games show box-score indicators without exposing possession estimates', async ({ page }) => {
  const { game, minutes } = minutesFixture();
  game.feedAvailability = { source: 'nba-api', limited: true };
  game.teamStats = { home: {}, away: {} };
  for (const side of ['home', 'away']) game.boxScore[side].totals = {
    points: side === 'home' ? 2 : 4, fieldGoalsMade: 1, fieldGoalsAttempted: 2,
    threePointersMade: side === 'home' ? 0 : 1, threePointersAttempted: 1,
    freeThrowsAttempted: 1, reboundsOffensive: 1, reboundsTotal: 3,
    pointsSecondChance: 2, pointsFromTurnovers: 0, pointsInThePaint: 2,
  };
  await page.route('**/functions/v1/scoreboard', route => route.fulfill({ json: [game] }));
  await page.route('**/functions/v1/game-metadata', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: body.minutesGameId ? { minutes } : { game } });
  });
  await page.route('**/boxscore_*.json', route => route.fulfill({ json: {} }));
  await page.goto(`/#/g/${game.gameId}`);
  await expect(page.getByRole('heading', { name: 'Shooting & Rebounding' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scoring Breakdown' })).toBeVisible();
  await expect(page.getByText('3P Rate', { exact: true })).toBeVisible();
  await expect(page.getByText('3P FG%', { exact: true })).toBeVisible();
  await expect(page.getByText('TOV%', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PACE Unavailable', { exact: true })).toBeVisible();
});
