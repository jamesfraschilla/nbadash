import { expect, test } from "@playwright/test";

const appUrl = (hash) => `http://127.0.0.1:4174/nbadash/#${hash}`;

test("Rotations reopens the guest user's most recently saved Graphics draft", async ({ page }) => {
  await page.goto(appUrl("/graphics?graphic=rotations"));
  await page.getByLabel("Opponent line").fill("VS PERSISTENCE TEST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/rotation=[0-9a-f-]+/);

  await page.goto(appUrl("/tools?tab=visual-drill"));
  await page.goto(appUrl("/graphics?graphic=rotations"));

  await expect(page).toHaveURL(/rotation=[0-9a-f-]+/);
  await expect(page.getByLabel("Opponent line")).toHaveValue("VS PERSISTENCE TEST");
});

test("legacy Rotations tool links redirect into Graphics", async ({ page }) => {
  await page.goto(appUrl("/tools?tab=rotations"));
  await expect(page).toHaveURL(/\/graphics\?graphic=rotations/);
  await expect(page.getByRole("button", { name: "Rotations", exact: true })).toBeVisible();
});

test("saved Court Time graphics refresh their players from the shared roster", async ({ page }) => {
  await page.route("**/rest/v1/rotations_shared_state**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: "[]",
      });
      return;
    }
    await route.continue();
  });
  await page.goto(appUrl("/graphics?graphic=court-time"));
  await page.evaluate(() => {
    window.localStorage.setItem("pregame:players:v2:washington", JSON.stringify({
      updatedAt: Date.now(),
      players: [{ id: "existing", name: "EXISTING PLAYER", display: "EXISTING", personId: "", cap: 48 }],
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/courtTime=[0-9a-f-]+/);

  await page.evaluate(() => {
    window.localStorage.setItem("pregame:players:v2:washington", JSON.stringify({
      updatedAt: Date.now() + 1000,
      players: [
        { id: "existing", name: "EXISTING PLAYER", display: "EXISTING", personId: "", cap: 48 },
        { id: "new-player", name: "NEW ROSTER PLAYER", display: "NEW PLAYER", personId: "", cap: 48 },
      ],
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Edit Players" }).click();

  await expect.poll(() => page.locator("input").evaluateAll((inputs) => (
    inputs.some((input) => input.value === "NEW ROSTER PLAYER")
  ))).toBe(true);
});
