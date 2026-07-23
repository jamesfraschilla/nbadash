import { expect, test } from "@playwright/test";

async function readStoredZipNames(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const names = [];
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    names.push(bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + extraLength + size;
  }
  return names;
}

test.beforeEach(async ({ page }) => {
  await page.goto("visual-test.html");
});

test("personnel export matches the approved rendered image", async ({ page }) => {
  await page.evaluate(() => window.renderPersonnelGolden());
  await expect(page.locator("#personnel-golden")).toHaveScreenshot("personnel-golden.png");
});

test("personnel stat columns default, bulk-toggle, and drag in export order", async ({ page }) => {
  await page.route("**/functions/v1/nba-rosters", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        season: "2026-27",
        fetchedAt: "2026-07-23T12:00:00.000Z",
        teams: {
          "1610612764": {
            teamId: "1610612764",
            teamAbbreviation: "WAS",
            players: [
              { personId: "1", fullName: "Alpha Player", familyName: "Player", jerseyNum: "1", teamId: "1610612764" },
              { personId: "2", fullName: "Beta Player", familyName: "Player", jerseyNum: "2", teamId: "1610612764" },
            ],
          },
        },
      }),
    });
  });
  await page.route("**/functions/v1/gleague-rosters", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ season: "2025-26", teams: {} }),
    });
  });
  await page.route("**/functions/v1/nba-player-stats**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        season: "2026-27",
        source: "nba",
        players: {
          "1": { personId: "1", fullName: "Alpha Player", ppg: 10, threePointPercentage: 35, rpg: 4, apg: 3 },
          "2": { personId: "2", fullName: "Beta Player", ppg: 12, threePointPercentage: 38, rpg: 5, apg: 2 },
        },
      }),
    });
  });

  await page.goto("http://127.0.0.1:4174/nbadash/#/tools?tab=graphics&graphic=personnel");
  const headers = page.locator('[role="columnheader"]');
  await expect(headers).toHaveCount(7);
  for (const [index, label] of ["PPG", "3P%", "RPG", "APG", "BPG", "SPG", "FTA"].entries()) {
    await expect(headers.nth(index)).toContainText(label);
  }

  await page.getByLabel("NBA Team").selectOption("1610612764");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.getByLabel("Unselect APG for all players").click();
  await expect(page.getByLabel("APG", { exact: true }).nth(0)).not.toBeChecked();
  await expect(page.getByLabel("APG", { exact: true }).nth(1)).not.toBeChecked();
  await page.getByLabel("Select BPG for all players").click();
  await expect(page.getByLabel("BPG", { exact: true }).nth(0)).toBeChecked();
  await expect(page.getByLabel("BPG", { exact: true }).nth(1)).toBeChecked();

  await page.getByLabel("Drag to reorder RPG column").dragTo(headers.nth(0));
  await expect(headers.nth(0)).toContainText("RPG");
  await expect(headers.nth(1)).toContainText("PPG");
  await expect(headers.nth(2)).toContainText("3P%");
});

test("multiple personnel exports download once as a ZIP", async ({ page }) => {
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => window.exportPersonnelGoldenZip());
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tst-personnel-graphics.zip");
  expect(await readStoredZipNames(download)).toEqual([
    "tst-27-riley-personnel.png",
    "tst-5-sample-personnel.png",
  ]);
});

test("complete Edge stats skip every browser-scraping fallback", async ({ page }) => {
  let fallbackRequests = 0;
  await page.route("**/functions/v1/nba-player-stats**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        season: "2026-27",
        source: "nba",
        players: {
          "1": { personId: "1", fullName: "Alpha Player", pointsPerGame: 10 },
          "2": { personId: "2", fullName: "Beta Player", pointsPerGame: 12 },
        },
      }),
    });
  });
  await page.route("https://r.jina.ai/**", async (route) => {
    fallbackRequests += 1;
    await route.abort();
  });
  const result = await page.evaluate(() => window.fetchPersonnelStatsForTest({
    teamId: "1610612764",
    season: "2026-27",
    players: [
      { personId: "1", fullName: "Alpha Player" },
      { personId: "2", fullName: "Beta Player" },
    ],
  }));
  expect(result.count).toBe(2);
  expect(fallbackRequests).toBe(0);
});

test("season changes clear overrides without losing a G League roster selection", async ({ page }) => {
  expect(await page.evaluate(() => window.runPersonnelStateRegression())).toEqual({
    league: "gleague",
    teamId: "1612709928",
    season: "2026-27",
    personId: "g-1",
    statOverrides: {},
  });
});

test("autosaves finish in the order they were queued", async ({ page }) => {
  expect(await page.evaluate(() => window.runAutosaveOrderRegression())).toEqual(["first", "second"]);
});

test("Supabase revision conflicts become an actionable client error", async ({ page }) => {
  await page.route("**/rest/v1/rpc/save_user_tool_record_atomic", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ code: "40001", message: "TOOL_RECORD_CONFLICT", details: null, hint: null }),
    });
  });
  expect(await page.evaluate(() => window.runToolConflictRegression())).toContain("changed in another browser");
});
