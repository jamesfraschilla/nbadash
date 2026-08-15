import { expect, test } from "@playwright/test";

function isWhitePixel(pixel) {
  return pixel.r > 245 && pixel.g > 245 && pixel.b > 245 && pixel.a === 255;
}

test.beforeEach(async ({ page }) => {
  await page.goto("visual-test.html");
});

test("coverage export collapses empty third column and restores it when populated", async ({ page }) => {
  const result = await page.evaluate(() => window.renderCoverageColumnRegression());

  expect(isWhitePixel(result.twoColumnMiddleSeparator)).toBe(true);
  expect(isWhitePixel(result.twoColumnFirstThirdSeparator)).toBe(false);
  expect(isWhitePixel(result.threeColumnFirstSeparator)).toBe(true);
  expect(isWhitePixel(result.threeColumnSecondSeparator)).toBe(true);
});

test("coverage editor removes and re-adds the third column", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/nbadash/#/graphics?graphic=coverage");

  await expect(page.getByRole("button", { name: "Coverage", exact: true })).toBeVisible();
  await expect(page.getByText("Title text", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Column header").nth(0)).toHaveValue("P/R");
  await expect(page.getByLabel("Column header").nth(1)).toHaveValue("DHO + C&S");
  await expect(page.getByLabel("Column header").nth(2)).toHaveValue("MISC");
  await expect(page.getByLabel("Text above icon").nth(0)).toHaveValue("5");
  await expect(page.getByLabel("Text above icon").nth(1)).toHaveValue("1-4");
  await expect(page.getByLabel("Coverage icon").nth(0)).toHaveValue("vol-1");
  await expect(page.getByLabel("Coverage icon").nth(1)).toHaveValue("red");
  await expect(page.getByText("Column 3", { exact: true })).toBeVisible();
  await page.getByLabel("Remove third coverage column").click();
  await expect(page.getByText("Column 3", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "+ Column" }).click();
  await expect(page.getByText("Column 3", { exact: true })).toBeVisible();
});
