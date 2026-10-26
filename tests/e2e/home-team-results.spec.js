import { expect, test } from "@playwright/test";

test("team view repairs legacy cached fixtures with finals and retains results after reload", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T12:00:00-04:00"));
  const team = (teamId, teamTricode, score = 0) => ({ teamId, teamTricode, score });
  const fixtures = [
    { gameId: "0022600086", gameDate: "2026-10-21", awayTeam: team(1610612749, "MIL"), homeTeam: team(1610612764, "WAS") },
    { gameId: "0022600097", gameDate: "2026-10-23", awayTeam: team(1610612761, "TOR"), homeTeam: team(1610612764, "WAS") },
    { gameId: "0022600108", gameDate: "2026-10-24", awayTeam: team(1610612764, "WAS"), homeTeam: team(1610612741, "CHI") },
    { gameId: "0022600129", gameDate: "2026-10-28", awayTeam: team(1610612764, "WAS"), homeTeam: team(1610612739, "CLE") },
  ].map((game) => ({ ...game, gameStatus: 1, gameStatusText: "7:00 pm ET", seasonType: "Regular Season" }));
  await page.addInitScript((games) => {
    const key = "nba-dashboard-team-season-games:v2:2026-27:1610612764";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), games }));
  }, fixtures);
  const dates = [];
  await page.route("**/api/games/byDate?**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    dates.push(date);
    const games = fixtures.filter((game) => game.gameDate === date).map((game) => ({ ...game,
      gameStatus: 3, gameStatusText: "Final", homeTeam: { ...game.homeTeam, score: 128 }, awayTeam: { ...game.awayTeam, score: 116 } }));
    return route.fulfill({ json: games });
  });
  await page.goto("#/?team=1610612764");
  const card = (id) => page.locator(`a[href*="/g/${id}?"]`);
  for (const game of fixtures.slice(0, 3)) {
    await expect(card(game.gameId).locator('[class*="statusLabel"]')).toHaveText("F");
    await expect(card(game.gameId)).toContainText("128");
    await expect(card(game.gameId)).toContainText("116");
  }
  await expect(card(fixtures[3].gameId)).toContainText("7:00 pm ET");
  expect(dates).not.toContain("2026-10-28");
  dates.length = 0;
  await page.reload();
  await expect(card(fixtures[0].gameId).locator('[class*="statusLabel"]')).toHaveText("F");
  expect(dates.filter((date) => ["2026-10-21", "2026-10-23", "2026-10-24"].includes(date))).toEqual([]);
});
