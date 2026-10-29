import { test, expect } from "@playwright/test";

test("dashboard 3P-OR% renders recovered missed threes, not offensive-rebound share", async ({ page }) => {
  const actions = [];
  for (let index = 0; index < 12; index++) {
    actions.push({ actionNumber: actions.length + 1, orderNumber: actions.length + 1, period: 1,
      clock: "PT06M00.00S", teamId: 1610612764, possession: 1610612764, personId: 101,
      actionType: "3pt", shotResult: index < 3 ? "Made" : "Missed", qualifiers: [] });
    if (index >= 3) actions.push({ actionNumber: actions.length + 1, orderNumber: actions.length + 1, period: 1,
      clock: "PT06M00.00S", teamId: index < 7 ? 1610612764 : 1610612739,
      possession: 1610612764, personId: index < 7 ? 101 : 201, actionType: "rebound",
      subType: index < 7 ? "offensive" : "defensive" });
  }
  const game = { gameId: "0022600133", gameStatus: 2, period: 1, gameClock: "PT06M00.00S", seasonYear: "2026-27",
    awayTeam: { teamId: 1610612764, teamTricode: "WAS", teamName: "Wizards", score: 9 },
    homeTeam: { teamId: 1610612739, teamTricode: "CLE", teamName: "Cavaliers", score: 0 },
    playByPlayActions: actions, officials: [], boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
    teamStats: { home: {}, away: {} } };
  await page.route("**/api/games/**", (route) => route.fulfill({ json: route.request().url().includes("byDate") ? [] : game }));
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("#/g/0022600133");
  const misc = page.locator("section").filter({ has: page.getByRole("heading", { name: "Misc", exact: true }) });
  await expect(misc.getByText("44.4%", { exact: true })).toBeVisible();
  await expect(misc.getByText("100.0%", { exact: true })).toHaveCount(0);
});
