import { expect, test } from "@playwright/test";

async function openGame(page, gameId, washington = true, wheel = false) {
  await page.route("**/api/games/**", (route) => {
    if (route.request().url().includes("byDate")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { gameId, seasonYear: "2026-27", gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
      homeTeam: { teamId: 1610612766, teamName: "Hornets", teamTricode: "CHA" },
      awayTeam: { teamId: washington ? 1610612764 : 1610612737, teamName: washington ? "Wizards" : "Hawks", teamTricode: washington ? "WAS" : "ATL" },
      playByPlayActions: [
        { actionNumber: 19, period: 1, clock: "PT10M36.00S", timeActual: "2026-10-26T23:11:58Z", teamId: 1610612766,
          actionType: "2pt", shotResult: "Made", description: "Miller turnaround fadeaway" },
        { actionNumber: 20, period: 1, clock: "PT10M00.00S", teamId: 1610612764,
          actionType: "3pt", shotResult: "Missed", description: "Missing timestamp shot" },
        ...["timeout", "freethrow", "rebound", "foul", "instantreplay", "substitution"].map((actionType, index) => ({
          actionNumber: 21 + index, period: 1, clock: "PT09M00.00S", teamId: 1610612766,
          timeActual: "2026-10-26T23:15:00Z", actionType, description: actionType,
        })),
      ], officials: [], boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
      teamStats: { home: {}, away: {} } } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto(wheel ? `#/g/${gameId}` : `#/g/${gameId}/events`);
  if (!wheel) await expect(page.getByRole("heading", { name: "Play-by-Play Events" })).toBeVisible();
}

test("every Washington event type uses NBA Clips, with unavailable times clearly disabled", async ({ page }) => {
  let clipRequests = 0;
  page.on("request", (request) => { if (request.url().startsWith("https://clips.nba.com/")) clipRequests++; });
  await openGame(page, "0022600119");
  await expect(page.getByRole("checkbox", { name: "NBA Clips (test)" })).toHaveCount(0);
  await expect(page.locator('a[href^="https://clips.nba.com/"]')).toHaveCount(7);
  await expect(page.locator('a[href*="inTime=19114800"]')).toHaveAttribute("href",
    "https://clips.nba.com/?gameNo=0022600119&inTime=19114800&outTime=19120800&source=grs");
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Video unavailable" })).toBeDisabled();
  expect(clipRequests).toBe(0);
});

test("ATC wheel keeps long-press Add Note from Play", async ({ page }) => {
  await openGame(page, "0022600108", true, true);
  await page.goto("#/g/0022600108/atc");
  const card = page.getByRole("region", { name: "Play-by-play wheel" }).locator('[class*="pbpCard"]').last();
  await card.hover();
  await page.mouse.down();
  await expect(page.getByRole("heading", { name: "Add Note From Play", exact: true })).toBeVisible();
  await page.mouse.up();
});

test("other teams keep original video links", async ({ page }) => {
  await openGame(page, "0022600108", false);
  await expect(page.getByRole("checkbox", { name: "NBA Clips (test)" })).toHaveCount(0);
  await expect(page.locator('a[href^="https://clips.nba.com/"]')).toHaveCount(0);
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(2);
});

test("regular and ATC dashboard wheels show events without clip icons or links", async ({ page }) => {
  await openGame(page, "0022600108", true, true);
  for (const suffix of ["", "/atc", ""]) {
    await page.goto(`#/g/0022600108${suffix}`);
    const wheel = page.getByRole("region", { name: "Play-by-play wheel" });
    await expect(wheel).toBeVisible();
    await expect(wheel.locator('[class*="pbpCard"]')).toHaveCount(8);
    await expect(wheel.locator("a")).toHaveCount(0);
    await expect(wheel.getByText(/▶|Clip/)).toHaveCount(0);
    await expect.poll(() => wheel.evaluate(element => Math.abs(element.scrollWidth - element.clientWidth - element.scrollLeft))).toBeLessThan(3);
    if (suffix) {
      await expect(page.getByRole("button", { name: "Analysis", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add Note", exact: true })).toHaveCount(0);
    }
  }
});
