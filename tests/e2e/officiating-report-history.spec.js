import { expect, test } from "@playwright/test";

test("official profile reports unknown callers without adding them to the whistle record", async ({ page }) => {
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    const common = { season: "2025-26", season_type: "Regular Season", game_id: "0022500247" };
    const data = table === "nba_official_profiles_cache" ? [{ season: "2025-26", id: "1", official_id: "1", name: "Known Official", games: 30, whistle_challenges: 1 }]
      : table === "nba_official_game_assignments" ? [{ ...common, official_id: "1", official_name: "Known Official", is_alternate: false }]
        : table === "nba_authoritative_coach_challenge_events_cache" ? [
          { ...common, id: "a", period: 1, game_clock: "01:00", challenging_team: "WAS", whistling_official_id: "1", whistling_official_name: "Known Official", source: "nba_official_challenge_pdf" },
          { ...common, id: "b", period: 2, game_clock: "02:00", challenging_team: "WAS", source: "nba_official_challenge_pdf" },
        ] : [];
    return route.fulfill({ json: data });
  });
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const { fetchOfficialProfileDetails } = await import("/nbadash/src/officiatingData.js");
    return fetchOfficialProfileDetails({ season: "2025-26", profile: { id: "1", name: "Known Official" } });
  });
  expect(result.challengeAttributionCoverage).toEqual({ total: 2, identified: 1, unknown: 1 });
  expect(result.whistleChallenges).toBe(1);
});

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
