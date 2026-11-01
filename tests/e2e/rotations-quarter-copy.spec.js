import { expect, test } from "@playwright/test";
const cells = (page, quarter) => page.locator(`td[data-quarter="${quarter}"] select`);
const values = (page, quarter) => cells(page, quarter).evaluateAll(nodes => nodes.map(n => n.value));
async function openRotations(page) {
  await page.route("**/functions/v1/**", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/rest/v1/**", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("http://127.0.0.1:4174/nbadash/#/graphics?graphic=rotations");
  await expect(page.getByRole("button", { name: "Copy Minutes", exact: true })).toHaveCount(4);
}
async function selectPlayer(page, quarter, index, optionIndex = 0) {
  const cell = cells(page, quarter).nth(index);
  const options = await cell.locator("option").evaluateAll(nodes => nodes.map(n => n.value).filter(Boolean));
  await cell.selectOption(options[optionIndex]);
}
test("quarter copy matches the whole pattern, disables its own period, supports Undo and preserves saved data", async ({ page }) => {
  await openRotations(page);
  await selectPlayer(page, 2, 0);
  await selectPlayer(page, 2, 6, 1);
  const source = await values(page, 2);
  const original = await values(page, 3);
  const q1 = await values(page, 1);
  const q4 = await values(page, 4);
  await page.getByRole("button", { name: "Copy Minutes", exact: true }).nth(1).click();
  const dialog = page.getByRole("dialog", { name: "Copy Q2 Minutes" });
  await expect(dialog.getByRole("button", { name: "2nd Quarter", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button")).toHaveCount(5);
  await dialog.getByRole("button", { name: "3rd Quarter", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await values(page, 3)).toEqual(source);
  expect(await values(page, 1)).toEqual(q1);
  expect(await values(page, 4)).toEqual(q4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await values(page, 3)).toEqual(original);
  await page.getByRole("button", { name: "Copy Minutes", exact: true }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "3rd Quarter", exact: true }).click();
  await selectPlayer(page, 3, 0, 1);
  expect(await values(page, 2)).toEqual(source);
  const saved = await values(page, 3);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/rotation=[0-9a-f-]+/);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByText(/Saved to My Vault as|Saved in this browser\.|Loaded WASHINGTON .* Rotations\./).first()).toBeVisible();
  await page.reload();
  await expect.poll(() => values(page, 3)).toEqual(saved);
  expect(await values(page, 2)).toEqual(source);
});
test("filled destination requires explicit overwrite and Cancel preserves its selections", async ({ page }) => {
  await openRotations(page);
  await selectPlayer(page, 2, 0);
  await selectPlayer(page, 4, 8, 1);
  const original = await values(page, 4);
  const source = await values(page, 2);
  await page.getByRole("button", { name: "Copy Minutes", exact: true }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "4th Quarter", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Replace Q4 Minutes?" });
  await expect(confirmation).toBeVisible();
  expect(await values(page, 4)).toEqual(original);
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await values(page, 4)).toEqual(original);
  await page.getByRole("dialog").getByRole("button", { name: "4th Quarter", exact: true }).click();
  await page.getByRole("button", { name: "Yes, Replace Minutes", exact: true }).click();
  expect(await values(page, 4)).toEqual(source);
  await expect(page.getByRole("button", { name: "Copy Minutes", exact: true }).first()).toHaveCSS("background-color", "rgb(22, 117, 59)");
  await expect(page.getByRole("button", { name: "Reset Q1 Minutes", exact: true })).toHaveCSS("background-color", "rgb(189, 32, 40)");
});
