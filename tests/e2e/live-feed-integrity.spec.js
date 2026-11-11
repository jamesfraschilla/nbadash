import { expect, test } from "@playwright/test";

test("an empty live refetch retains cached game data and the next valid response recovers", async ({ page }) => {
  let empty = false;
  const game = { gameId: "0022600119", gameStatus: 2, period: 4, gameClock: "PT10M00.00S",
    homeTeam: { teamId: 1, score: 80 }, awayTeam: { teamId: 2, score: 68 },
    boxScore: { home: { players: [] }, away: { players: [] } },
    playByPlayActions: [{ period: 4, actionType: "2pt", scoreHome: "80", scoreAway: "68" }] };
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.route("**/game-metadata", (route) => {
    const body = route.request().postDataJSON();
    if ((body.primaryPlayByPlayGameId || body.playByPlayGameId)) return route.fulfill({ json: { game: { gameId: game.gameId, actions: [] } } });
    return route.fulfill({ json: { game: empty ? { ...game, playByPlayActions: [] } : game } });
  });
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

test("G League game recovers split play-by-play for live and final snapshots", async ({ page }) => {
  let status = 2;
  const gameId = "2052600011";
  await page.route("**/game-metadata", route => {
    const body = route.request().postDataJSON();
    if ((body.primaryPlayByPlayGameId || body.playByPlayGameId)) return route.fulfill({ json: { game: { gameId, actions: [{ actionNumber: 12, period: 1, actionType: "2pt" }] } } });
    return route.fulfill({ json: { game: { gameId, gameStatus: status, homeTeam: { teamId: 1, score: 12 }, awayTeam: { teamId: 2, score: 10 }, boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } } } } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("visual-test.html");
  for (const gameStatus of [2, 3]) {
    status = gameStatus;
    const result = await page.evaluate(async (id) => {
      const { fetchGame } = await import("/nbadash/src/api.js");
      const game = await fetchGame(id);
      return { status: game.gameStatus, score: game.homeTeam.score, action: game.playByPlayActions[0].actionNumber };
    }, gameId);
    expect(result).toEqual({ status: gameStatus, score: 12, action: 12 });
  }
});

test("a split feed repairs an empty three-quarter segment without including the fourth", async ({ page }) => {
  const gameId = "2052600011";
  const actions = [
    { actionNumber: 1, orderNumber: 1, period: 1, teamId: 1, personId: 10, actionType: "2pt", shotResult: "Made", scoreHome: 2, scoreAway: 0 },
    { actionNumber: 2, orderNumber: 2, period: 2, teamId: 2, personId: 20, actionType: "3pt", shotResult: "Made", scoreHome: 2, scoreAway: 3 },
    { actionNumber: 3, orderNumber: 3, period: 4, teamId: 1, personId: 10, actionType: "2pt", shotResult: "Made", scoreHome: 4, scoreAway: 3 },
  ];
  const game = { gameId, gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
    homeTeam: { teamId: 1, score: 4 }, awayTeam: { teamId: 2, score: 3 },
    boxScore: { home: { players: [{ personId: 10 }], totals: { points: 4 } }, away: { players: [{ personId: 20 }], totals: { points: 3 } } } };
  await page.route("**/game-metadata", (route) => {
    const body = route.request().postDataJSON();
    if ((body.primaryPlayByPlayGameId || body.playByPlayGameId)) return route.fulfill({ json: { game: { gameId, actions } } });
    return route.fulfill({ json: { game: body.segment ? { ...game, playByPlayActions: actions, segmentDataQuality: { source: "nba-period-boxscore" }, boxScore: {
      home: { players: [{ personId: 10 }], totals: { points: 0 } }, away: { players: [{ personId: 20 }], totals: { points: 0 } },
    } } : { ...game, playByPlayActions: actions } } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  await page.goto("visual-test.html");
  const result = await page.evaluate(async (id) => {
    const { fetchGame } = await import("/nbadash/src/api.js");
    const game = await fetchGame(id, "Q1-Q3");
    return { home: game.boxScore.home.totals.points, away: game.boxScore.away.totals.points, source: game.segmentDataQuality?.source };
  }, gameId);
  expect(result).toEqual({ home: 2, away: 3, source: "play-by-play" });
});
