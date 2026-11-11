import { test, expect } from "@playwright/test";

for (const variant of ["regular", "atc"]) {
  test(`live G League ${variant} recovers missing play-by-play through the NBA backend`, async ({ page }) => {
    let pbpRequests = 0;
    let gameRequests = 0;
    await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
    await page.route("**/functions/v1/game-metadata", route => {
      const body = route.request().postDataJSON();
      if ((body.primaryPlayByPlayGameId || body.playByPlayGameId)) {
        pbpRequests += 1;
        return route.fulfill({ json: { game: { gameId: "2052600002", actions: [
          { actionNumber: 1, period: 1, clock: "PT12M00.00S", actionType: "jumpball", teamId: "1612709928", jumpBallWonTeamId: "1612709928" },
        ] } } });
      }
      if (!(body.primaryGameId || body.liveGameId)) return route.fulfill({ status: 503, json: {} });
      gameRequests += 1;
      return route.fulfill({ json: { game: {
        gameId: "2052600002", gameStatus: 2, period: 2, gameClock: "PT06M00.00S",
        awayTeam: { teamId: "1612709928", teamName: "Go-Go", teamTricode: "CCG", score: 42 },
        homeTeam: { teamId: "1612709909", teamName: "Blue Coats", teamTricode: "DEL", score: 38 },
        boxScore: { away: { players: [], totals: {} }, home: { players: [], totals: {} } },
        teamStats: { away: {}, home: {} }, officials: [],
      } } });
    });
    await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
    await page.route(/referee-assignments/, route => route.fulfill({ status: 503, json: {} }));
    await page.route("**/boxscore_*.json", route => route.fulfill({ status: 403, body: "Access denied" }));
    await page.goto(`#/g/2052600002${variant === "atc" ? "/atc" : ""}`);
    const scoreboard = page.locator('[class*="scoreboard"]').first();
    await expect(scoreboard.getByText("42", { exact: true }).first()).toBeVisible();
    await expect(scoreboard.getByText("38", { exact: true }).first()).toBeVisible();
    expect(pbpRequests).toBeGreaterThan(0);
    expect(gameRequests).toBeGreaterThan(0);
    await expect(page.getByText("Failed to load game details.", { exact: true })).toHaveCount(0);
  });
}
