import { expect, test } from "@playwright/test";

test("an empty live refetch retains cached game data and the next valid response recovers", async ({ page }) => {
  let empty = false;
  const game = { gameId: "0022600119", gameStatus: 2, period: 4, gameClock: "PT10M00.00S",
    homeTeam: { teamId: 1, score: 80 }, awayTeam: { teamId: 2, score: 68 },
    playByPlayActions: [{ period: 4, actionType: "2pt", scoreHome: "80", scoreAway: "68" }] };
  await page.route("**/api/games/0022600119", (route) => route.fulfill({ json: empty ? { ...game, playByPlayActions: [] } : game }));
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("visual-test.html");
  await page.evaluate(async () => {
    const { QueryClient } = await import("/nbadash/node_modules/.vite/deps/@tanstack_react-query.js");
    const { gameQueryOptions } = await import("/nbadash/src/queries.js");
    window.integrityClient = new QueryClient();
    window.integrityOptions = gameQueryOptions("0022600119", { retry: false, staleTime: 0 });
    await window.integrityClient.fetchQuery(window.integrityOptions);
  });
  empty = true;
  const rejected = await page.evaluate(async () => {
    let code;
    try { await window.integrityClient.fetchQuery(window.integrityOptions); } catch (error) { code = error.code; }
    const retained = window.integrityClient.getQueryData(window.integrityOptions.queryKey);
    return { code, actions: retained.playByPlayActions.length, score: retained.homeTeam.score };
  });
  expect(rejected).toEqual({ code: "EMPTY_LIVE_FEED", actions: 1, score: 80 });
  empty = false;
  const recovered = await page.evaluate(async () => {
    await window.integrityClient.fetchQuery(window.integrityOptions);
    return window.integrityClient.getQueryState(window.integrityOptions.queryKey).status;
  });
  expect(recovered).toBe("success");
});
