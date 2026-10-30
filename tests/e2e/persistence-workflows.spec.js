import { expect, test } from "@playwright/test";

const appUrl = (hash) => `http://127.0.0.1:4174/nbadash/#${hash}`;

test("Vault Notes remains selected when Graphics access is enabled", async ({ page }) => {
  await page.route("**/functions/v1/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(appUrl("/me?tab=graphics"));
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page).toHaveURL(/tab=notes/);
  await expect(page.getByText("You have not saved any notes yet.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("You have not saved any notes yet.", { exact: true })).toBeVisible();
});

test("Graphics opens on a neutral landing page with Rotations first", async ({ page }) => {
  await page.goto(appUrl("/graphics"));
  const tabs = page.locator('[aria-label="Graphic tools"] button');
  await expect(tabs.first()).toHaveText("Rotations");
  await expect(page.getByText("Select a graphics tool from above.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/graphics$/);
});

test("Rotations reopens the guest user's most recently saved Graphics draft", async ({ page }) => {
  await page.route("**/functions/v1/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  // This is a guest/local-persistence test. A successful empty remote vault
  // response authoritatively clears local drafts, racing the simulated save.
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: route.request().url().includes("user_tool_records") ? 503 : 200,
    contentType: "application/json", body: "[]",
  }));
  await page.goto(appUrl("/graphics?graphic=rotations"));
  await page.getByLabel("Opponent line").fill("VS PERSISTENCE TEST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/rotation=[0-9a-f-]+/);
  // The redirect can happen before the async save handler finishes refreshing
  // its queries. Wait for completion before unloading the document, rather
  // than testing an interrupted save on a busy CI runner.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByText(/Saved to My Vault as|Saved in this browser\.|Loaded WASHINGTON VS PERSISTENCE TEST Rotations\./).first()).toBeVisible();

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
