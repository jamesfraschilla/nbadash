import { expect, test } from "@playwright/test";

async function openGame(page, gameId) {
  await page.route("**/api/games/**", (route) => {
    if (route.request().url().includes("byDate")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { gameId, seasonYear: "2026-27", gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
      homeTeam: { teamId: 1610612766, teamName: "Hornets", teamTricode: "CHA" },
      awayTeam: { teamId: 1610612764, teamName: "Wizards", teamTricode: "WAS" },
      playByPlayActions: [
        { actionNumber: 19, period: 1, clock: "PT10M36.00S", timeActual: "2026-10-26T23:11:58Z", teamId: 1610612766,
          actionType: "2pt", shotResult: "Made", description: "Miller turnaround fadeaway" },
        { actionNumber: 20, period: 1, clock: "PT10M00.00S", teamId: 1610612764,
          actionType: "3pt", shotResult: "Missed", description: "Missing timestamp shot" },
      ], officials: [] } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto(`#/g/${gameId}/events`);
  await expect(page.getByRole("heading", { name: "Play-by-Play Events" })).toBeVisible();
}

test("WAS–CHA trial links have an instant original-link switch and missing-time fallback", async ({ page }) => {
  let clipRequests = 0;
  page.on("request", (request) => { if (request.url().startsWith("https://clips.nba.com/")) clipRequests++; });
  await openGame(page, "0022600119");
  const toggle = page.getByRole("checkbox", { name: "NBA Clips (test)" });
  await expect(toggle).toBeChecked();
  await expect(page.locator('a[href^="https://clips.nba.com/"]')).toHaveAttribute("href",
    "https://clips.nba.com/?gameNo=0022600119&inTime=19114800&outTime=19120800&source=grs");
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(1);
  await toggle.uncheck();
  await expect(page.locator('a[href^="https://clips.nba.com/"]')).toHaveCount(0);
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(2);
  expect(clipRequests).toBe(0);
});

test("all other games keep their original video links and do not show trial controls", async ({ page }) => {
  await openGame(page, "0022600108");
  await expect(page.getByRole("checkbox", { name: "NBA Clips (test)" })).toHaveCount(0);
  await expect(page.locator('a[href^="https://clips.nba.com/"]')).toHaveCount(0);
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(2);
});
