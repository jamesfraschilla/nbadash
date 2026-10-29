import { test, expect } from "@playwright/test";

test("Challenge Log keeps official Video and timestamp Clock links separate", async ({ page }) => {
  const video = "https://dmmx2.nba.com/videourlredirect?&project=/ON-AIR/0022600118_20261025_211929";
  const clock = "https://clips.nba.com/?gameNo=0022600118&inTime=21191900&outTime=21193900&source=grs";
  const row = { id: "challenge-fixture", season: "2026-27", season_type: "Regular Season", game_id: "0022600118",
    game_date: "2026-10-25", away_team: "MEM", home_team: "SAC", challenging_team: "MEM", period: 1,
    game_clock: "07:26.0", challenge_type: "Foul", initial_call: "Defensive Foul", call_ruling: "Overturned",
    challenge_outcome: "successful", video_url: video, clock_clip_url: clock, source: "nba_official_challenge_pdf" };
  const unpublished = { ...row, id: "unpublished", game_id: "0022600133", game_date: "2026-10-28",
    game_clock: "05:01.0", clock_clip_url: "https://clips.nba.com/?gameNo=0022600133&inTime=20000000&outTime=20002000&source=grs",
    video_url: "https://www.nba.com/stats/events?GameID=0022600133&GameEventID=100", source: "play_by_play" };
  await page.route("**/rest/v1/**", route => route.fulfill({ json:
    route.request().url().includes("nba_authoritative_coach_challenge_events") ? [row, unpublished] : [] }));
  await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/games/**", route => route.fulfill({ json: [] }));
  await page.goto("#/officiating?tab=challenge-log&season=2026-27");
  await expect(page.getByRole("link", { name: "07:26", exact: true })).toHaveAttribute("href", clock);
  await expect(page.getByRole("link", { name: "Watch", exact: true })).toHaveAttribute("href", video);
  const unpublishedRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: "05:01", exact: true }) });
  await expect(unpublishedRow.getByRole("link", { name: "05:01", exact: true })).toHaveAttribute("href", unpublished.clock_clip_url);
  await expect(unpublishedRow.getByRole("link", { name: "Watch", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(0);
});
