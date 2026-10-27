import { expect, test } from "@playwright/test";

test("saving a custom Playcall preserves Q1 5:03 and stores its shifted video URL", async ({ page }) => {
  let savedNote;
  await page.route("**/functions/v1/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("rpc/create_user_note_atomic")) {
      savedNote = route.request().postDataJSON().p_note;
      return route.fulfill({ json: savedNote });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/games/**", (route) => {
    if (route.request().url().includes("byDate")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { gameId: "0022600119", seasonYear: "2026-27", gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
      homeTeam: { teamId: 1610612766, teamName: "Hornets", teamTricode: "CHA" },
      awayTeam: { teamId: 1610612764, teamName: "Wizards", teamTricode: "WAS" },
      playByPlayActions: [{ actionNumber: 19, period: 1, clock: "PT04M53.00S", timeActual: "2026-10-26T23:30:10Z",
        teamId: 1610612766, actionType: "2pt", shotResult: "Made", description: "Test shot" }],
      boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
      teamStats: { home: {}, away: {} }, officials: [] } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("#/g/0022600119");
  await page.getByRole("button", { name: "Add Note", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Add Note", exact: true }) });
  const selects = dialog.locator("select");
  await selects.nth(0).selectOption("Q1");
  await selects.nth(1).selectOption("5");
  await selects.nth(2).selectOption("03");
  await dialog.getByRole("checkbox", { name: "Playcall", exact: true }).check();
  await dialog.locator("textarea").fill("Test playcall");
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(() => savedNote?.source_meta?.clip_url).toBe(
    "https://clips.nba.com/?gameNo=0022600119&inTime=19300000&outTime=19302000&source=grs",
  );
  expect(savedNote).toMatchObject({ period_label: "Q1", minutes: 5, seconds: 3, text: "Test playcall",
    tags: ["Playcall"], sharing_scope: "shared", source_meta: { type: "custom_playcall" } });
});
