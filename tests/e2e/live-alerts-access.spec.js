import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/nbadash/visual-test.html");
});

test("live alerts keep the trailing possession open and prioritize halftime", async ({ page }) => {
  const result = await page.evaluate(() => window.runLiveAlertRegression());
  expect(result).toEqual({
    unfinishedHasEmptyAlert: false,
    halftimePrimaryCategory: "Halftime",
  });
});

test("Graphics-only authorization does not imply Tools access", async ({ page }) => {
  const result = await page.evaluate(() => window.runFeatureAccessRegression());
  expect(result).toEqual({ graphics: true, tools: false });
});
