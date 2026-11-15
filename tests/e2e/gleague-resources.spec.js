import { test, expect } from "@playwright/test";

async function openGame(page, { gleague = true, pregame = false, used = false, deriveFromPbp = false } = {}) {
  const homeId = gleague ? "1612709928" : "1610612764";
  const awayId = gleague ? "1612709909" : "1610612766";
  const gameId = gleague ? "2022600001" : "0022600015";

  await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await page.route("**/functions/v1/game-metadata", route => {
    const body = route.request().postDataJSON();
    if (!(body.primaryGameId || body.liveGameId)) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: { game: { gameId, gameStatus: pregame ? 1 : 3, period: pregame ? 0 : 2,
      homeTeam: { teamId: homeId, teamName: "Go-Go", teamTricode: "CCG", score: 30 },
      awayTeam: { teamId: awayId, teamName: "Opponent", teamTricode: "OPP", score: 29 },
      // Deliberately misleading NBA-style count: G League must not use it.
      timeouts: { home: 0, away: 7 },
      ...(deriveFromPbp ? {} : { challenges: { home: { challengesTotal: used ? 1 : 0, challengesWon: 0 } } }),
      playByPlayActions: deriveFromPbp ? [
        { actionNumber: 1, period: 1, clock: "PT08M53.00S", actionType: "instantreplay", subType: "challenge", descriptor: "overturned", teamId: homeId },
        { actionNumber: 2, period: 2, clock: "PT11M35.00S", actionType: "instantreplay", subType: "challenge", descriptor: "support", teamId: awayId },
      ] : used ? [
        { actionNumber: 1, period: 1, actionType: "timeout", subType: "challenge", teamId: homeId },
        { actionNumber: 2, period: 1, actionType: "timeout", subType: "reset", teamId: homeId },
        { actionNumber: 3, period: 1, actionType: "timeout", subType: "regular", teamId: homeId },
      ] : [],
      boxScore: { home: { teamId: homeId, players: [], totals: {} }, away: { teamId: awayId, players: [], totals: {} } },
      teamStats: { home: {}, away: {} }, officials: [] } } });
  });
  await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
  await page.goto(`#/g/${gameId}`);
}

test("G League pregame shows five timeouts, one Reset and two challenges for each team", async ({ page }) => {
  await openGame(page, { pregame: true });
  const board = page.locator('[class*="scoreboard"]').first();
  await expect(board.locator('[class*="timeoutNumber"]')).toHaveCount(10);
  await expect(board.getByText("RESET", { exact: true })).toHaveCount(2);
  await expect(board.getByLabel(/Challenge [12]: available/)).toHaveCount(4);
});

test("a failed challenge keeps the second available and neither it nor Reset costs a regular timeout", async ({ page }) => {
  await openGame(page, { used: true });
  const home = page.locator('[class*="homeTeamBlock"]').first();
  await expect(home.locator('[class*="timeoutNumber"]')).toHaveCount(5);
  await expect(home.locator('[class*="timeoutInactive"]')).toHaveCount(1);
  await expect(home.locator('[class*="resetUsed"]')).toHaveCount(1);
  await expect(home.getByLabel("Challenge 1: lost")).toBeVisible();
  await expect(home.getByLabel("Challenge 2: available")).toBeVisible();
});

test("NBA keeps seven timeouts, no Reset and the existing challenge eligibility", async ({ page }) => {
  await openGame(page, { gleague: false, pregame: true });
  const board = page.locator('[class*="scoreboard"]').first();
  await expect(board.locator('[class*="timeoutNumber"]')).toHaveCount(14);
  await expect(board.getByText("RESET", { exact: true })).toHaveCount(0);
  await expect(board.getByLabel("Challenge 1: available")).toHaveCount(2);
  await expect(board.getByLabel("Challenge 2: available")).toHaveCount(0);
});

for (const gleague of [false, true]) {
  test(`${gleague ? "G League" : "NBA"} challenge icons use play-by-play when the game feed omits challenge totals`, async ({ page }) => {
    await openGame(page, { gleague, deriveFromPbp: true });
    const home = page.locator('[class*="homeTeamBlock"]').first();
    const away = page.locator('[class*="awayTeamBlock"]').first();
    await expect(home.getByLabel("Challenge 1: won")).toBeVisible();
    await expect(away.getByLabel("Challenge 1: lost")).toBeVisible();
    await expect(home.getByLabel("Challenge 2: available")).toHaveCount(1);
    await expect(away.getByLabel("Challenge 2: available")).toHaveCount(gleague ? 1 : 0);
  });
}
