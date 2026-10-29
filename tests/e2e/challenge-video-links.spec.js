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
  const toronto = { ...row, id: "toronto-clock-regression", game_id: "0022600097", game_date: "2026-10-23",
    game_clock: "00:54.2", period: 2, away_team: "TOR", home_team: "WAS", challenging_team: "TOR",
    challenge_type: "OOB", initial_call: "Home Team Ball", clock_clip_url: null, clock_link_version: "3",
    clock_time_actual: "2026-10-24T00:15:58Z",
    video_url: "https://dmmx2.nba.com/videourlredirect?&project=/ON-AIR/0022600097_20261023_201736" };
  await page.route("**/rest/v1/**", route => route.fulfill({ json:
    route.request().url().includes("nba_authoritative_coach_challenge_events") ? [row, unpublished, toronto] : [] }));
  await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/games/**", route => route.fulfill({ json: [] }));
  await page.goto("#/officiating?tab=challenge-log&season=2026-27");
  await expect(page.getByRole("link", { name: "07:26", exact: true })).toHaveAttribute("href", clock);
  const publishedRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: "07:26", exact: true }) });
  await expect(publishedRow.getByRole("link", { name: "Watch", exact: true })).toHaveAttribute("href", video);
  const unpublishedRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: "05:01", exact: true }) });
  await expect(unpublishedRow.getByRole("link", { name: "05:01", exact: true })).toHaveAttribute("href", unpublished.clock_clip_url);
  await expect(unpublishedRow.getByRole("link", { name: "Watch", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="https://www.nba.com/stats/events"]')).toHaveCount(0);
  const torontoRow = page.getByRole("row").filter({ has: page.getByText("00:54", { exact: true }) });
  await expect(torontoRow).toBeVisible();
  await expect(torontoRow.getByRole("link", { name: "00:54", exact: true })).toHaveCount(0);
  await expect(torontoRow.getByRole("link", { name: "Watch", exact: true })).toHaveAttribute("href", toronto.video_url);
});
