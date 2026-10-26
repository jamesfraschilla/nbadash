import { expect, test } from "@playwright/test";

test("Q1–Q3 empty feed loads the full roster and only the first three quarters", async ({ page }) => {
  let fullRequests = 0;
  const game = { gameId: "0022600118", gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
    homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 }, playByPlayActions: [
      { actionNumber: 1, orderNumber: 1, period: 1, teamId: 1, personId: 10, actionType: "2pt", shotResult: "Made", scoreHome: 2, scoreAway: 0 },
      { actionNumber: 2, orderNumber: 2, period: 4, teamId: 1, personId: 10, actionType: "3pt", shotResult: "Made", scoreHome: 5, scoreAway: 0 },
    ], boxScore: { home: { players: [{ personId: 10, familyName: "Player", points: 5 }], totals: { points: 5 } },
      away: { players: [{ personId: 20, familyName: "Other" }], totals: { points: 0 } } } };
  await page.route("**/api/games/0022600118**", (route) => {
    const segment = new URL(route.request().url()).searchParams.has("segment");
    if (!segment) fullRequests++;
    return route.fulfill({ json: segment ? { ...game, boxScore: { home: { players: [], totals: { points: 0 } },
      away: { players: [], totals: { points: 0 } } } } : game });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const { fetchGame } = await import("/nbadash/src/api.js");
    return fetchGame("0022600118", "Q1-Q3");
  });
  expect(fullRequests).toBe(1);
  expect(result.boxScore.home.totals.points).toBe(2);
  expect(result.boxScore.home.players[0].points).toBe(2);
  expect(result.boxScore.home.players[0].familyName).toBe("Player");
  expect(result.segmentDataQuality.source).toBe("play-by-play");
});
