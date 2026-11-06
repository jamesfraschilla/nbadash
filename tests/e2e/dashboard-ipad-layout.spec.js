import { test, expect } from "@playwright/test";

async function openGame(page, variant) {
  await page.addInitScript(() => {
    localStorage.setItem("referee_headshot_overrides_v1", JSON.stringify(Object.fromEntries(
      ["rayacosta", "johnbutler", "phenizeeransom"].map(name => [name, { scale: 1.51, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 80 }])
    )));
  });
  await page.route("**/api/games/**", route => {
    if (route.request().url().includes("byDate")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { gameId: "0022600015", gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
      homeTeam: { teamId: "1610612753", teamName: "Magic", teamTricode: "ORL", score: 94 },
      awayTeam: { teamId: "1610612764", teamName: "Wizards", teamTricode: "WAS", score: 103 },
      playByPlayActions: [{ actionNumber: 1, period: 1, clock: "PT12M00.00S", actionType: "jumpball", teamId: "1610612764", jumpBallWonTeamId: "1610612764" }],
      boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } }, teamStats: { home: {}, away: {} },
      officials: [{ personId: "1", name: "Ray Acosta", jerseyNum: "54", role: "crewChief" },
        { personId: "2", name: "John Butler", jerseyNum: "30", role: "referee" },
        { personId: "3", name: "Phenizee Ransom", jerseyNum: "70", role: "umpire" }] } });
  });
  await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
  await page.goto(`#/g/0022600015${variant === "atc" ? "/atc" : ""}`);
  await expect(page.locator('[class*="possessionTableWrap"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "Tonight's officials" }).locator("canvas")).toHaveCount(3);
}

for (const width of [768, 820, 1024, 1366, 1920]) {
  for (const variant of ["regular", "atc"]) {
    test(`${width} ${variant}: quarter labels align and referee canvases fill their frames`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await openGame(page, variant);
      const summary = page.locator('[class*="possessionTableWrap"]');
      const geometry = await summary.evaluate(element => {
        const center = node => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; };
        const labels = [...element.querySelectorAll('[class*="possessionTeamCodeLabel"]')];
        const rows = [...element.querySelectorAll('[class*="possessionRow"]')];
        return { deltas: labels.map((label, i) => Math.abs(center(label) - center(rows[i + 2]))),
          width: element.querySelector('[class*="possessionRow"]').getBoundingClientRect().width };
      });
      // Cover the same rehydration that raced the original measurements on CI.
      await page.evaluate(() => window.dispatchEvent(new Event("referee-headshots-updated")));
      const frames = page.getByRole("region", { name: "Tonight's officials" }).locator('[class*="avatarFrame"]');
      // Hydration/assignment refresh can briefly replace a canvas with its
      // fallback. Measure only a complete rendered set, including on slow CI.
      const readSizes = () => frames.evaluateAll(elements => elements.map(frame => {
        const canvas = frame.querySelector("canvas");
        if (!canvas) return null;
        const outer = frame.getBoundingClientRect(); const image = canvas.getBoundingClientRect();
        return { frame: [outer.width, outer.height], canvas: [image.width, image.height], bottomGap: outer.bottom - image.bottom };
      }));
      let sizes;
      await expect.poll(async () => { sizes = await readSizes(); return sizes; })
        .toEqual(Array.from({ length: 3 }, () => ({ frame: [84, 84], canvas: [84, 84], bottomGap: 0 })));
      expect(geometry.deltas.every(delta => delta < 1), JSON.stringify({ geometry, sizes })).toBe(true);
      expect(geometry.width).toBe(width <= 900 ? 180 : 220);
      for (const size of sizes) {
        expect(size.frame).toEqual([84, 84]);
        expect(size.canvas).toEqual([84, 84]);
        expect(Math.abs(size.bottomGap)).toBeLessThan(0.5);
      }
      // The saved crop reaches the bottom; the frame must not expose an extra
      // white strip below its canvas, regardless of Retina scale or browser.
      for (let index = 0; index < 3; index++) {
        await expect.poll(() => frames.nth(index).evaluate(frame => {
          const node = frame.querySelector("canvas");
          if (!node) return false;
          const pixel = node.getContext("2d").getImageData(42, 82, 1, 1).data;
          return pixel[0] < 200 && pixel[1] < 200 && pixel[2] < 200;
        })).toBe(true);
      }
      await summary.screenshot({ path: test.info().outputPath("quarter-table.png") });
      await frames.first().screenshot({ path: test.info().outputPath("referee.png") });
    });
  }
}
