import { test, expect } from "@playwright/test";

for (const pregame of [false, true]) {
  test(`header Possesion Game ${pregame ? "stays zero before tip-off" : "adds offensive rebounds and subtracts turnovers"}`, async ({ page }) => {

    await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
    await page.route("**/functions/v1/game-metadata", route => {
      const body = route.request().postDataJSON();
      if (!(body.primaryGameId || body.liveGameId)) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { game: {
        gameId: "0022600015", gameStatus: pregame ? 1 : 3, period: pregame ? 0 : 4,
        awayTeam: { teamId: "1610612764", teamName: "Wizards", teamTricode: "WAS", score: 100 },
        homeTeam: { teamId: "1610612766", teamName: "Hornets", teamTricode: "CHA", score: 90 },
        teamStats: { away: { possessions: 100, offensiveRating: 100, defensiveRating: 100 }, home: { possessions: 90, offensiveRating: 100, defensiveRating: 100 } },
        boxScore: {
          away: { players: [], totals: { reboundsOffensive: 9, reboundsTotal: 35, turnovers: 12 } },
          home: { players: [], totals: { reboundsOffensive: 6, reboundsTotal: 30, turnovers: 8 } },
        },
        officials: [], playByPlayActions: pregame ? [] : [
          { actionNumber: 1, period: 1, clock: "PT12M00.00S", actionType: "jumpball", teamId: "1610612764", jumpBallWonTeamId: "1610612764" },
        ],
      } } });
    });
    await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
    await page.route(/referee-assignments/, route => route.fulfill({ status: 503, json: {} }));
    await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
    await page.goto("#/g/0022600015");
    const row = page.locator('[class*="centerMetricRow"]').filter({ hasText: "Possession Game" });
    await expect(row.locator('[class*="statValue"]')).toHaveText(pregame ? ["0", "0"] : ["97", "88"]);
    await expect(page.getByText("CHANCES", { exact: true })).toHaveCount(0);
    if (!pregame) {
      const ratings = page.locator('[class*="centerMetricRow"]').filter({ hasText: "ORTG" });
      await expect(ratings.locator('[class*="statValue"]')).toHaveText(["100", "100"]);
    }
  });
}
