import { expect, test } from "@playwright/test";

test("visible legacy notes share one read-only feed lookup and never rewrite stored notes", async ({ page }) => {
  let gameRequests = 0;
  const noteWrites = [];
  await page.route("**/api/games/0022600119", (route) => {
    gameRequests++;
    return route.fulfill({ json: { gameId: "0022600119", gameStatus: 3, period: 4,
      homeTeam: { teamId: 1610612766 }, awayTeam: { teamId: 1610612764 },
      playByPlayActions: [{ actionNumber: 19, period: 1, clock: "PT04M53.00S", actionType: "2pt", timeActual: "2026-10-26T23:30:10Z" }] } });
  });
  await page.route("**/boxscore_*.json", (route) => route.fulfill({ json: {} }));
  page.on("request", (request) => {
    if (request.method() !== "GET" && /user_note|note_atomic/.test(request.url())) noteWrites.push(request.url());
  });
  await page.goto("visual-test.html");
  await page.evaluate(async () => {
    const { default: React } = await import("/nbadash/node_modules/.vite/deps/react.js");
    const { default: ReactDOM } = await import("/nbadash/node_modules/.vite/deps/react-dom_client.js");
    // Use Vite's exact resolved dependency URL so the harness and component
    // share a QueryClient context, including the optimizer version query.
    const querySource = await (await fetch("/nbadash/src/queries.js")).text();
    const queryDependency = querySource.match(/from "([^"]*@tanstack_react-query[^\"]*)"/)[1];
    const { QueryClient, QueryClientProvider } = await import(queryDependency);
    const { default: NoteClipLink } = await import("/nbadash/src/components/NoteClipLink.jsx");
    const notes = [
      { id: "custom", game_id: "0022600119", period_label: "Q1", minutes: 5, seconds: 3, tags: ["Playcall"], text: "Original custom note", source_meta: {} },
      { id: "pbp", game_id: "0022600119", period_label: "Q1", minutes: 4, seconds: 53, tags: ["Officiating"], text: "Original event note",
        source_meta: { type: "pbp", action_number: 19, clip_url: "https://www.nba.com/stats/events?GameEventID=19" } },
    ];
    window.notesBeforeUpgrade = JSON.stringify(notes);
    window.notesBeingUpgraded = notes;
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    ReactDOM.createRoot(host).render(React.createElement(QueryClientProvider, { client: new QueryClient() },
      notes.map((note) => React.createElement(NoteClipLink, { key: note.id, note, isWashington: true }))));
  });
  const links = page.getByRole("link", { name: "Open play clip" });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) await expect(link).toHaveAttribute("href",
    "https://clips.nba.com/?gameNo=0022600119&inTime=19300000&outTime=19302000&source=grs");
  expect(gameRequests).toBe(1);
  expect(noteWrites).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(window.notesBeingUpgraded) === window.notesBeforeUpgrade)).toBe(true);
});

test("notes created from Washington events persist NBA Clips rather than obsolete event pages", async ({ page }) => {
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const { buildPlayByPlaySourceMeta } = await import("/nbadash/src/noteHelpers.js");
    const action = { actionNumber: 19, actionType: "timeout", timeActual: "2026-10-26T23:30:10Z" };
    const options = { gameId: "0022600108", seasonYear: "2026-27", action };
    return {
      washington: buildPlayByPlaySourceMeta({ ...options, game: { gameId: options.gameId, homeTeam: { teamId: 1610612764 } } }),
      other: buildPlayByPlaySourceMeta({ ...options, game: { gameId: options.gameId, homeTeam: { teamId: 1610612737 } } }),
    };
  });
  expect(result.washington.clip_url).toContain("https://clips.nba.com/?gameNo=0022600108");
  expect(result.other.clip_url).toContain("https://www.nba.com/stats/events?");
});
