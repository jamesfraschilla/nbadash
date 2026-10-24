import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("visual-test.html");
});

test("match-up preview skips empty player slots during partial renders", async ({ page }) => {
  const result = await page.evaluate(() => window.renderPartialMatchupSlotRegression());

  expect(result.mismatches).toBe(0);
});

test("all NBA roster players keep automatic G League portraits behind NBA sources", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { buildPlayerHeadshotCandidates } = await import("/nbadash/src/pages/matchupGraphicExport.js");
    const rosters = await fetch("/nbadash/src/data/rosters.json").then((response) => response.json());
    const failures = [];
    let checked = 0;
    for (const [teamId, players] of Object.entries(rosters)) {
      for (const player of players) {
        if (!/^\d+$/.test(String(player.personId))) continue;
        const urls = buildPlayerHeadshotCandidates({ ...player, teamId });
        const nbaIndex = urls.findIndex((url) => url.includes("cdn.nba.com/headshots/"));
        const gLeagueIndex = urls.findIndex((url) => url.includes("/functions/v1/player-headshot?"));
        if (nbaIndex < 0 || (gLeagueIndex >= 0 && gLeagueIndex < nbaIndex)) failures.push(player.fullName);
        checked += 1;
      }
    }
    return {
      teams: Object.keys(rosters).length, checked, failures,
      buzelis: buildPlayerHeadshotCandidates({ personId: "1641824", teamId: "1610612741" }),
      custom: buildPlayerHeadshotCandidates({ personId: "1641824", headshotUrl: "data:image/png;base64,custom" }),
    };
  });
  expect(result.teams).toBe(30);
  expect(result.checked).toBeGreaterThan(400);
  expect(result.failures).toEqual([]);
  expect(result.buzelis[0]).toContain("/1040x760/1641824.png?v=headshots-v2-");
  expect(result.custom).toEqual(["data:image/png;base64,custom"]);
});

test("match-up tool renders a preview before export is ready", async ({ page }) => {
  await page.route("**/logos/nba/**/logo.svg", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"45\" fill=\"#002b5c\"/></svg>",
    });
  });

  await page.goto("http://127.0.0.1:4174/nbadash/#/graphics?graphic=matchup");

  const preview = page.getByLabel("Match-up graphic preview");
  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await expect(page.getByText("Preview appears after both teams, ten players, and a logo are selected.")).toHaveCount(0);

  await expect.poll(async () => preview.evaluate((canvas) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
  })).toBe(255);
});
