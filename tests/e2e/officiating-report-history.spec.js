import { expect, test } from "@playwright/test";

test("Officials Report assignment history includes preseason without broadening statistical queries", async ({ page }) => {
  const excludedPreseason = [];
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const assignments = table === "nba_official_game_assignments";
    if (assignments && url.searchParams.has("season_type")) excludedPreseason.push(url.searchParams.get("season_type"));
    await route.fulfill({ json: assignments ? [{
      season: "2026-27", season_type: "Preseason", game_id: "0012600038",
      game_date: "2026-10-10", home_team: "WAS", away_team: "DET",
      official_id: "1627526", official_name: "Matt Kallio", is_alternate: false,
    }] : [] });
  });
  await page.goto("visual-test.html");
  const report = await page.evaluate(async () => {
    const { fetchOfficialsReportData } = await import("/nbadash/src/officiatingData.js");
    return fetchOfficialsReportData({ scheduleSeason: "2026-27", officialNames: ["Matt Kallio"] });
  });
  expect(excludedPreseason).toEqual([]);
  expect(report.profiles[0].schedule).toEqual([expect.objectContaining({ game_id: "0012600038", season_type: "Preseason" })]);
});
