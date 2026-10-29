import { expect, test } from "@playwright/test";

test("NBA Cup renders the same trophy and thin gold frame in both graphic exports", async ({ page }) => {
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const { renderMatchupGraphicCanvas, NBA_CUP_GOLD } = await import("/nbadash/src/pages/matchupGraphicExport.js");
    const { renderPersonnelGraphic } = await import("/nbadash/src/pages/personnelGraphicExport.js");
    const { renderCoverageGraphicCanvas } = await import("/nbadash/src/pages/coverageGraphicExport.js");
    const headshot = document.createElement("canvas");
    headshot.width = 100;
    headshot.height = 100;
    const personnelOptions = { player: { fullName: "Test Player", jerseyNum: "8" }, stats: {}, selectedStats: ["ppg", "rpg", "apg", "fta"], tags: [], tagImages: {}, headshotImage: headshot };
    const matchup = await renderMatchupGraphicCanvas({ nbaCup: true });
    const personnel = await renderPersonnelGraphic({ ...personnelOptions, nbaCup: true });
    const standard = await renderPersonnelGraphic(personnelOptions);
    const preview = await renderMatchupGraphicCanvas({ nbaCup: true, width: 960, height: 540 });
    const coverage = await renderCoverageGraphicCanvas({ nbaCup: true });
    const coveragePreview = await renderCoverageGraphicCanvas({ nbaCup: true, outputWidth: 960, outputHeight: 540 });
    const pixel = (canvas, x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    const logoPixels = (canvas) => [...canvas.getContext("2d").getImageData(83, 53, 140, 140).data];
    matchup.id = "cup-matchup";
    personnel.id = "cup-personnel";
    coverage.id = "cup-coverage";
    document.querySelector("#root").replaceChildren(matchup, personnel, coverage);
    return { gold: NBA_CUP_GOLD, borders: [pixel(matchup, 0, 500), pixel(personnel, 1919, 500), pixel(preview, 0, 250), pixel(coverage, 0, 500), pixel(coveragePreview, 0, 250)], standard: pixel(standard, 0, 500), sameTrophy: JSON.stringify(logoPixels(matchup)) === JSON.stringify(logoPixels(personnel)) && JSON.stringify(logoPixels(matchup)) === JSON.stringify(logoPixels(coverage)), trophyCenter: pixel(matchup, 153, 120) };
  });
  expect(result.borders).toEqual(Array(5).fill([230, 197, 124, 255]));
  expect(result.standard).not.toEqual(result.borders[0]);
  expect(result.sameTrophy).toBe(true);
  expect(result.trophyCenter[3]).toBe(255);
  await page.locator("#cup-personnel").screenshot({ path: "output/nba-cup-personnel.png" });
  await page.locator("#cup-matchup").screenshot({ path: "output/nba-cup-matchup.png" });
  await page.locator("#cup-coverage").screenshot({ path: "output/nba-cup-coverage.png" });
});

test("Coverage NBA Cup mode updates the preview, saves, reloads, and resets", async ({ page }) => {
  await page.goto("#/graphics?graphic=coverage");
  const cup = page.getByRole("checkbox", { name: "NBA Cup", exact: true });
  await expect(cup).not.toBeChecked();
  await cup.check();
  const canvas = page.locator("canvas").last();
  await expect.poll(() => canvas.evaluate((c) => [...c.getContext("2d").getImageData(0, 250, 1, 1).data])).toEqual([230, 197, 124, 255]);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("coverage-graphic.png");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/coverage=/);
  await page.reload();
  await expect(cup).toBeChecked();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(cup).not.toBeChecked();
});

test("NBA Cup controls appear beside Reset and the league selector, defaulting off", async ({ page }) => {
  await page.goto("#/graphics?graphic=matchup");
  const matchupCup = page.getByRole("checkbox", { name: "NBA Cup", exact: true });
  await expect(matchupCup).not.toBeChecked();
  await matchupCup.check();
  const preview = page.getByLabel("Match-up graphic preview");
  await expect.poll(() => preview.evaluate((canvas) => [...canvas.getContext("2d").getImageData(0, 250, 1, 1).data])).toEqual([230, 197, 124, 255]);
  await page.getByRole("button", { name: "Personnel", exact: true }).click();
  const personnelCup = page.getByRole("checkbox", { name: "NBA Cup", exact: true });
  await expect(personnelCup).not.toBeChecked();
  await personnelCup.check();
  await expect(personnelCup).toBeChecked();
  const reset = await page.getByRole("button", { name: "Reset", exact: true }).boundingBox();
  const cup = await personnelCup.boundingBox();
  expect(cup.x).toBeGreaterThan(reset.x + reset.width);
});
