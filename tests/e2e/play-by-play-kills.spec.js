import { expect, test } from "@playwright/test";

const WAS = 1610612764;
const OPP = 1610612740;
const event = (n, type, team, extra = {}) => ({ actionNumber: n, orderNumber: n, period: 1, clock: "PT05M00.00S",
  teamId: team, possession: team, actionType: type, description: `Event ${n}`, ...extra });
const actions = [event(1, "turnover", OPP), event(2, "turnover", WAS), event(3, "turnover", OPP), event(4, "turnover", WAS),
  event(5, "2pt", OPP, { shotResult: "Missed" }), event(6, "timeout", OPP),
  event(7, "rebound", WAS, { subType: "defensive" }), event(8, "turnover", WAS),
  event(9, "2pt", OPP, { shotResult: "Made" }), event(10, "turnover", WAS),
  event(11, "turnover", OPP), event(12, "turnover", WAS), event(13, "turnover", OPP), event(14, "turnover", WAS),
  event(15, "3pt", OPP, { shotResult: "Made" }),
  event(16, "substitution", WAS, { subType: "out", personId: 42, playerName: "Test Player" }),
  event(17, "substitution", WAS, { subType: "in", personId: 43, playerName: "Other Player" })];

async function openGame(page, washington = true, wheel = false) {
  await page.route("**/api/games/**", (route) => {
    if (route.request().url().includes("byDate")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { gameId: "0022600108", seasonYear: "2026-27", gameStatus: 3, period: 4,
      gameClock: "PT00M00.00S", homeTeam: { teamId: washington ? WAS : 1610612737, teamName: washington ? "Wizards" : "Hawks", teamTricode: washington ? "WAS" : "ATL" },
      awayTeam: { teamId: OPP, teamName: "Pelicans", teamTricode: "NOP" }, playByPlayActions: actions,
      boxScore: { home: { teamId: WAS, players: [], totals: {} }, away: { teamId: OPP, players: [], totals: {} } },
      teamStats: { home: {}, away: {} }, officials: [] } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto(wheel ? "#/g/0022600108" : "#/g/0022600108/events");
  if (!wheel) await expect(page.getByRole("heading", { name: "Play-by-Play Events" })).toBeVisible();
}

test("dashboard scroll wheel shares single Kill markers and white timeouts in both themes", async ({ page }) => {
  await openGame(page, true, true);
  const wheel = page.locator('[class*="pbpWheelInner"]');
  await expect(wheel).toBeVisible();
  const completed = wheel.locator('[data-kill-highlight="completed"]');
  const missed = wheel.locator('[data-kill-highlight="missed"]');
  await expect(completed).toHaveCount(1);
  await expect(completed).toContainText("Event 7");
  await expect(missed).toHaveCount(1);
  await expect(missed).toContainText("Event 15");
  const timeout = wheel.locator('[class*="pbpCardTimeout"]');
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    await expect(timeout).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(timeout.locator('[class*="pbpText"]')).toHaveCSS("color", "rgb(17, 17, 17)");
    await expect(completed).toHaveCSS("background-color", "rgb(220, 38, 38)");
    await expect(missed).toHaveCSS("background-color", "rgb(255, 244, 163)");
  }
});

test("Wizards possessions use red/yellow, while timeouts stay white including hover", async ({ page }) => {
  await openGame(page);
  const completed = page.locator('[data-kill-highlight="completed"]');
  const missed = page.locator('[data-kill-highlight="missed"]');
  await expect(completed).toHaveCount(1);
  await expect(missed).toHaveCount(1);
  await expect(completed.first()).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(missed.first()).toHaveCSS("background-color", "rgb(255, 244, 163)");
  await completed.first().hover();
  await expect(completed.first()).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(completed.first().locator('[class*="clock"]')).toHaveCSS("color", "rgb(255, 255, 255)");
  await missed.first().hover();
  await expect(missed.first()).toHaveCSS("background-color", "rgb(255, 244, 163)");
  await expect(missed.first().locator('[class*="clock"]')).toHaveCSS("color", "rgb(17, 17, 17)");
  const timeout = page.locator('[class*="eventRow"]').filter({ hasText: "Event 6" });
  await expect(timeout).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await timeout.hover();
  await expect(timeout).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(timeout.locator('[class*="clock"]')).toHaveCSS("color", "rgb(17, 17, 17)");
  await page.getByRole("checkbox", { name: "Latest First" }).uncheck();
  await expect(completed).toHaveCount(1);
  await expect(missed).toHaveCount(1);
  await page.getByRole("button", { name: "Q1", exact: true }).click();
  await expect(completed).toHaveCount(1);
});

test("non-Wizards games retain white timeouts without any Kill highlights", async ({ page }) => {
  await openGame(page, false);
  await expect(page.locator("[data-kill-highlight]")).toHaveCount(0);
  await expect(page.getByLabel("Play-by-play highlight colors")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Kills", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Potential Kills", exact: true })).toHaveCount(0);
  await expect(page.locator('[class*="eventRow"]').filter({ hasText: "Event 6" }))
    .toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("Kill filters work independently, combine, and preserve period/order/substitution controls", async ({ page }) => {
  await openGame(page);
  const rows = page.locator('[class*="eventRow"]');
  const kills = page.getByRole("checkbox", { name: "Kills", exact: true });
  const potential = page.getByRole("checkbox", { name: "Potential Kills", exact: true });
  const subs = page.getByRole("checkbox", { name: "Substitutions Only", exact: true });
  await expect(kills).not.toBeChecked();
  await expect(potential).not.toBeChecked();
  const total = await rows.count();

  await kills.check();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('[data-kill-highlight="completed"]')).toHaveCount(1);
  await expect(page.getByText("Total Events: 1", { exact: true })).toBeVisible();
  await kills.uncheck();
  await potential.check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-kill-highlight", "missed");

  await kills.check();
  await expect(rows).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Latest First" }).uncheck();
  await expect(rows.first()).toContainText("Event 7");
  await page.getByRole("button", { name: "Q2", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: "Q1", exact: true }).click();
  await expect(rows).toHaveCount(2);

  await kills.uncheck();
  await potential.uncheck();
  await subs.check();
  await expect(rows).toHaveCount(1);
  await kills.check();
  await potential.check();
  await expect(rows).toHaveCount(3);
  await kills.uncheck();
  await potential.uncheck();
  await subs.uncheck();
  await expect(rows).toHaveCount(total);
});
