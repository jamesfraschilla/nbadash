import { expect, test } from "@playwright/test";
const game = { gameId: "0022600015", gameStatus: 2, period: 3, homeTeam: { teamId: 1, score: 51 }, awayTeam: { teamId: 2, score: 46 }, boxScore: { home: { players: [] }, away: { players: [] } }, playByPlayActions: [{ actionNumber: 1 }] };
test("reload during outage immediately restores labeled public data and retains it after failed refresh", async ({ page }) => {
  let down = false;
  await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
  await page.route("**/game-metadata", route => route.fulfill(down ? { status: 503, json: { error: "down" } } : { json: { game } }));
  await page.goto("visual-test.html");
  await page.evaluate(async () => {
    const { gameQueryOptions } = await import("/nbadash/src/queries.js");
    await gameQueryOptions("0022600015").queryFn();
  });
  down = true;
  await page.reload();
  const result = await page.evaluate(async () => {
    const { gameQueryOptions } = await import("/nbadash/src/queries.js");
    const options = gameQueryOptions("0022600015");
    let failed = false;
    try { await options.queryFn(); } catch { failed = true; }
    return { score: options.initialData.homeTeam.score, timestamp: options.initialData._snapshotSavedAt, failed,
      mismatch: gameQueryOptions("0022600016").initialData, otherSegment: gameQueryOptions("0022600015", { segment: "Q1" }).initialData };
  });
  expect(result.score).toBe(51);
  expect(result.timestamp).toBeGreaterThan(0);
  expect(result.failed).toBe(true);
  expect(result.mismatch).toBeUndefined();
  expect(result.otherSegment).toBeUndefined();
});
test("primary HTTP outage recovers core game through backend rather than browser CDN", async ({ page }) => {
  await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
  await page.route("**/game-metadata", route => route.fulfill({ json: { game: { ...game, feedAvailability: { limited: true, source: "nba-live-backup" } } } }));
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => (await import("/nbadash/src/api.js")).fetchGame("0022600015"));
  expect(result.homeTeam.score).toBe(51);
  expect(result.feedAvailability.limited).toBe(true);
});
test("a hanging optional boxscore request has a deadline", async ({ page }) => {
  await page.route("**/game-metadata", route => route.fulfill({ json: { game } }));
  await page.route("**/boxscore_*.json", () => {});
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const start = performance.now();
    const g = await (await import("/nbadash/src/api.js")).fetchGame("0022600015");
    return { score: g.homeTeam.score, elapsed: performance.now() - start };
  });
  expect(result.score).toBe(51);
  expect(result.elapsed).toBeLessThan(5000);
});
test("a section exception does not remove sibling dashboard content", async ({ page }) => {
  await page.goto("visual-test.html");
  await page.evaluate(async () => {
    const { default: React } = await import("/nbadash/node_modules/.vite/deps/react.js");
    const { default: ReactDOM } = await import("/nbadash/node_modules/.vite/deps/react-dom_client.js");
    const { default: Boundary } = await import("/nbadash/src/components/SectionErrorBoundary.jsx");
    const root = document.createElement("div"); document.body.appendChild(root);
    ReactDOM.createRoot(root).render(React.createElement(React.Fragment, null,
      React.createElement("p", null, "Scoreboard remains available"),
      React.createElement(Boundary, { name: "Alerts", render: () => { throw Error("bad alert"); } })));
  });
  await expect(page.getByText("Scoreboard remains available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry section" })).toBeVisible();
});
