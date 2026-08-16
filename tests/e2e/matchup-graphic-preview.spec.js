import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("visual-test.html");
});

test("match-up preview skips empty player slots during partial renders", async ({ page }) => {
  const result = await page.evaluate(() => window.renderPartialMatchupSlotRegression());

  expect(result.mismatches).toBe(0);
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
