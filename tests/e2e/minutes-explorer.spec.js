import { expect, test } from "@playwright/test";
import { minutesFixture } from "../fixtures/minutesExplorer.js";

async function openMinutes(page, { incompletePbp = false } = {}) {
  const { minutes, game } = minutesFixture();
  if (incompletePbp) game.playByPlayActions = game.playByPlayActions.filter((action) => action.actionType !== "freethrow");
  await page.route("**/api/games/0022600015", (route) => route.fulfill({ json: game }));
  await page.route("**/api/games/0022600015/minutes", (route) => route.fulfill({ json: minutes }));
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.route("**/functions/v1/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("#/m/0022600015");
  await expect(page.getByRole("button", { name: "Table", exact: true })).toBeVisible();
}

test("table is default, team vantages replace home/away, timeline and neutral render appearances", async ({ page }) => {
  await openMinutes(page);
  await expect(page.getByRole("button", { name: "Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "CHA", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "WAS", exact: true })).toBeVisible();
  await expect(page.getByText("Vantage", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("region", { name: "Player rotation timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /P\. Player1, Q1/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Neutral", exact: true }).click();
  await expect(page.getByRole("button", { name: /P\. Player11, Q1/ })).toHaveCount(1);
  await page.screenshot({ path: "output/minutes-timeline.png", fullPage: true });
});
test("combos updates instantly, shows all masks, caps selection at four, keeps team selections separate", async ({ page }) => {
  await openMinutes(page);
  await page.getByRole("button", { name: "Combos", exact: true }).click();
  await page.getByRole("button", { name: "P. Player1", exact: true }).click();
  await page.getByRole("button", { name: "P. Player6", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await expect(page.getByRole("columnheader", { name: "OPP TOV%", exact: true })).toBeVisible();
  await page.screenshot({ path: "output/minutes-combos.png", fullPage: true });
  await page.getByRole("button", { name: "P. Player2", exact: true }).click();
  await page.getByRole("button", { name: "P. Player3", exact: true }).click();
  await expect(page.getByRole("button", { name: "P. Player4", exact: true })).toBeDisabled();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(16);
  await page.getByRole("button", { name: "WAS", exact: true }).click();
  await expect(page.getByText("Select players above to calculate their combinations.")).toBeVisible();
});
test("mobile timeline scrolls within its panel without widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMinutes(page);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("incomplete play-by-play blocks unverified combination ratings", async ({ page }) => {
  await openMinutes(page, { incompletePbp: true });
  await page.getByRole("button", { name: "Combos", exact: true }).click();
  await page.getByRole("button", { name: "P. Player1", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Combination statistics unavailable");
  await expect(page.getByRole("table")).toHaveCount(0);
});
