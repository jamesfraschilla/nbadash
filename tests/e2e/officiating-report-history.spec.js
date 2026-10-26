import { expect, test } from "@playwright/test";

test("report compares only 25-game peers while retaining limited-sample rates", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    const officials = [["small", 24, 24], ["eligible", 25, 25], ["high", 30, 60]];
    const data = table === "nba_official_profiles_cache" ? officials.map(([id, games, calls]) => ({
      season: "2026-27", id, official_id: id, name: id, games, calls, fouls: calls,
    })) : table === "nba_official_call_category_rollups_cache" ? officials.map(([id, games, calls]) => ({
      season: "2026-27", official_key: id, official_id: id, official_name: id, category: "Offensive Foul", games, calls,
    })) : [];
    return route.fulfill({ json: data });
  });
  await page.goto("visual-test.html");
  const report = await page.evaluate(async () => {
    const { fetchOfficialsReportData } = await import("/nbadash/src/officiatingData.js");
    return fetchOfficialsReportData({ officialNames: ["small", "eligible", "high"] });
  });
  const small = report.profiles.find((row) => row.name === "small");
  const eligible = report.profiles.find((row) => row.name === "eligible");
  expect(small.percentileSample).toEqual({ games: 24, minimumGames: 25, population: 2 });
  expect(small.callsByCategory["Offensive Foul"].value).toBe(1);
  expect(small.callsByCategory["Offensive Foul"].percentile).toBeNull();
  expect(eligible.callsByCategory["Offensive Foul"].percentile).toBe(1);
});

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
