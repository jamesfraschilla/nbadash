import { expect, test } from "@playwright/test";

test("Tools starts empty with exactly the three requested tabs and no default team", async ({ page }) => {
  await page.goto("#/tools");
  await expect(page.getByText("Select a Tool from above", { exact: true })).toBeVisible();
  const tabs = page.getByRole("button").filter({ hasText: /^(Playcalls|Custom Requests|Visual Drill)$/ });
  await expect(tabs).toHaveText(["Playcalls", "Custom Requests", "Visual Drill"]);
  for (const name of ["Analytics Report", "Pre-Game Scouting Packet", "Late Game Matrix"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Playcalls", exact: true }).click();
  await expect(page.getByLabel("NBA Team")).toHaveValue("");
  await expect(page.getByLabel("NBA Team").locator("option")).toHaveCount(31);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("Save publishes team-scoped tables; conflicts preserve unpublished drafts", async ({ context, page }) => {
  const saved = new Map();
  let writes = 0;
  await context.route("**/rest/v1/rotations_shared_state**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "GET" ? null : request.postDataJSON();
    const team = body?.scope_key || url.searchParams.get("scope_key")?.replace(/^eq\./, "");
    if (request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved.has(team) ? [saved.get(team)] : []) });
    }
    writes++;
    if ((request.method() === "POST" && saved.has(team)) || (request.method() === "PATCH" && url.searchParams.get("updated_at") !== `eq.${saved.get(team)?.updated_at}`)) {
      return route.fulfill({ status: request.method() === "POST" ? 409 : 406, contentType: "application/json", body: request.method() === "POST" ? '{"code":"23505"}' : '{"code":"PGRST116","details":"The result contains 0 rows"}' });
    }
    const row = { payload: body.payload, updated_at: `2026-10-12T19:00:${String(writes).padStart(2, "0")}Z` };
    saved.set(team, row);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.goto("#/tools?tab=playcalls");
  await page.getByLabel("NBA Team").selectOption("1610612764");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Playcall row 1", { exact: true }).fill("Horns Away");
  await page.getByLabel("Action row 1", { exact: true }).fill("Double drag screen");
  await page.getByLabel("Description row 1", { exact: true }).fill("Guard uses the screen. Center rolls to the rim.");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Horns Away", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/nba-dashboard-playcall-tracking.png", fullPage: true });
  const other = await context.newPage();
  await other.goto("#/tools?tab=playcalls&team=1610612764");
  await expect(other.getByRole("cell", { name: "Horns Away", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Playcall row 1", { exact: true }).fill("Unpublished draft");
  await other.getByRole("button", { name: "Edit", exact: true }).click();
  await other.getByLabel("Playcall row 1", { exact: true }).fill("Other user's update");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Another user saved changes");
  await expect(page.getByLabel("Playcall row 1", { exact: true })).toHaveValue("Unpublished draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Other user's update", exact: true })).toBeVisible();
  await page.getByLabel("NBA Team").selectOption("1610612751");
  await expect(page.getByText("No playcalls saved yet. Click Edit to get started.")).toBeVisible();
  await page.getByLabel("NBA Team").selectOption("1610612764");
  await expect(page.getByRole("cell", { name: "Other user's update", exact: true })).toBeVisible();
});

test("failed shared saves never publish or discard edits", async ({ page }) => {
  await page.route("**/rest/v1/rotations_shared_state**", (route) => route.fulfill({
    status: route.request().method() === "GET" ? 200 : 503,
    contentType: "application/json", body: route.request().method() === "GET" ? "[]" : '{"message":"Service unavailable"}',
  }));
  await page.goto("#/tools?tab=playcalls&team=1610612764");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Playcall row 1", { exact: true }).fill("Preserve this draft");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(page.getByLabel("Playcall row 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your draft is preserved");
  await expect(page.getByLabel("Playcall row 1", { exact: true })).toHaveValue("Preserve this draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("NBA Team").selectOption("1610612751");
  await expect(page.getByLabel("NBA Team")).toHaveValue("1610612764");
});

test("column headers sort without changing which source row is edited", async ({ page }) => {
  const stored = {
    payload: { rows: [
      { playcall: "Zoom 10", action: "Screen", description: "Third" },
      { playcall: "Alpha", action: "Cut", description: "First" },
      { playcall: "Zoom 2", action: "Drive", description: "Second" },
    ] },
    updated_at: "2026-10-15T13:03:00Z",
  };
  await page.route("**/rest/v1/rotations_shared_state**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([stored]) });
    }
    const body = route.request().postDataJSON();
    stored.payload = body.payload;
    stored.updated_at = "2026-10-15T13:04:00Z";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stored) });
  });

  await page.goto("#/tools?tab=playcalls&team=1610612764");
  await page.getByRole("button", { name: "Sort by Playcall" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Alpha");
  await expect(page.getByRole("columnheader", { name: /Playcall/ })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Description row 2", { exact: true }).fill("Edited Alpha");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(stored.payload.rows.map((row) => row.description)).toEqual(["Third", "Edited Alpha", "Second"]);
  await page.getByRole("button", { name: /Sort by Playcall/ }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Zoom 10");
  await page.getByRole("button", { name: /Sort by Playcall/ }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Zoom 10");
});
