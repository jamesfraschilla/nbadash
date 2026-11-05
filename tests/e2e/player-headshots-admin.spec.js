import { test, expect } from "@playwright/test";

test("Admin headshots supports all three rosters and preserves team-specific manual keys", async ({ page }) => {
  const players = {
    washington_summer: [{ id: "summer-row", name: "Summer Player", display: "Summer", personId: "101" }],
    washington: [{ id: "wizards-row", name: "Wizards Player", display: "Wizard", personId: "102" }],
    capital_city: [{ id: "gogo-row", name: "Go-Go Player", display: "Go-Go", personId: "" }],
  };
  let writes = 0;
  await page.route("**/rest/v1/rotations_shared_state?**", route => {
    if (route.request().method() !== "GET") writes++;
    const scope = new URL(route.request().url()).searchParams.get("scope_key")?.replace(/^eq\./, "");
    return route.fulfill({ json: { payload: { players: players[scope] || [] }, updated_at: "2026-11-05T12:00:00Z" } });
  });
  await page.goto("visual-test.html");
  await page.evaluate(() => window.renderPlayerHeadshotsAdminFixture());
  const roster = page.getByLabel("Roster", { exact: true });
  const player = page.getByLabel("Roster player", { exact: true });
  await expect(roster.locator("option")).toHaveText(["Washington Wizards", "Capital City Go-Go", "Summer League"]);
  await player.selectOption("101");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Summer Player");
  await roster.selectOption("washington");
  await expect(page.getByLabel("Player ID / Headshot key")).toHaveValue("");
  await expect(player).not.toContainText("Summer Player");
  await player.selectOption("102");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Wizards Player");
  await roster.selectOption("capital_city");
  await player.selectOption("manual:1612709928:gogo-row");
  await expect(page.getByLabel("Player ID / Headshot key")).toHaveValue("manual:1612709928:gogo-row");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Go-Go Player");
  await roster.selectOption("washington_summer");
  await player.selectOption("101");
  expect(writes).toBe(0);
});

test("a failed roster refresh retains saved players and does not leak the previous roster", async ({ page }) => {
  await page.route("**/rest/v1/rotations_shared_state?**", route => route.fulfill({ status: 403, json: { message: "Unavailable" } }));
  await page.goto("visual-test.html");
  await page.evaluate(() => {
    localStorage.setItem("pregame:players:v2:capital_city", JSON.stringify({ updatedAt: 1, players: [
      { id: "saved", name: "Saved Go-Go", display: "Saved", personId: "202" },
    ] }));
    window.renderPlayerHeadshotsAdminFixture();
  });
  await page.getByLabel("Roster", { exact: true }).selectOption("capital_city");
  await expect(page.getByText("Unable to refresh roster. Showing any saved roster players.")).toBeVisible();
  await page.getByLabel("Roster player", { exact: true }).selectOption("202");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Saved Go-Go");
});
