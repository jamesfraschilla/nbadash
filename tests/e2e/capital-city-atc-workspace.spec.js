import { test, expect } from "@playwright/test";

async function setup(context, { capitalCity = true } = {}) {
  const saved = new Map();
  const writes = [];
  let failSave = false;

  await context.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await context.route("**/functions/v1/game-metadata", route => {
    const body = route.request().postDataJSON();
    if (!(body.primaryGameId || body.liveGameId)) return route.fulfill({ status: 503, json: {} });
    const gameId = (body.primaryGameId || body.liveGameId);
    return route.fulfill({ json: { game: { gameId, gameStatus: 3, period: 4, gameClock: "PT00M00.00S",
      homeTeam: { teamId: capitalCity ? "1612709928" : "1610612764", teamName: capitalCity ? "Go-Go" : "Wizards", teamCity: capitalCity ? "Capital City" : "Washington", teamTricode: capitalCity ? "CCG" : "WAS" },
      awayTeam: { teamId: "1612709909", teamName: "Opponent", teamTricode: "OPP" },
      playByPlayActions: [{ actionNumber: 1, actionType: "period", subType: "start", period: 1, clock: "PT12M00.00S" }],
      boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
      officials: [], teamStats: { home: {}, away: {} } } } });
  });
  await context.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
  await context.route("**/rest/v1/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "GET" ? null : request.postDataJSON();
    const scope = body?.scope_type || url.searchParams.get("scope_type")?.replace(/^eq\./, "");
    if (scope !== "capital_city_atc_workspace") return route.fulfill({ json: [] });
    const key = body?.scope_key || url.searchParams.get("scope_key")?.replace(/^eq\./, "");
    if (request.method() === "GET") return route.fulfill({ json: saved.has(key) ? [saved.get(key)] : [] });
    if (failSave) return route.fulfill({ status: 403, json: { message: "Save unavailable" } });
    if ((request.method() === "POST" && saved.has(key)) || (request.method() === "PATCH" && url.searchParams.get("updated_at") !== `eq.${saved.get(key)?.updated_at}`)) {
      return route.fulfill({ status: request.method() === "POST" ? 409 : 200, json: request.method() === "POST" ? { code: "23505" } : [] });
    }
    writes.push({ key, payload: body.payload });
    const row = { payload: body.payload, updated_at: `2026-11-06T20:00:${String(writes.length).padStart(2, "0")}Z` };
    saved.set(key, row);
    return route.fulfill({ json: row });
  });
  return { saved, writes, setFailSave: value => { failSave = value; } };
}

test("Capital City ATC alone has locked Notes and Drawing below Officials; text saves are shared and game-scoped", async ({ page, context }) => {
  const { writes } = await setup(context);
  await page.goto("#/g/2022600001");
  await expect(page.getByRole("region", { name: "Play-by-play wheel" })).toBeVisible();
  await expect(page.getByRole("region", { name: "ATC Notes", exact: true })).toHaveCount(0);
  await page.goto("#/g/2022600001/atc");
  const notes = page.getByRole("region", { name: "ATC Notes", exact: true });
  const drawing = page.getByRole("region", { name: "ATC Drawing", exact: true });
  await expect(notes.getByLabel("ATC text")).toHaveAttribute("readonly", "");
  await expect(drawing.getByLabel("ATC drawing board")).toHaveCSS("touch-action", "pan-y");
  await notes.getByRole("button", { name: "Edit", exact: true }).click();
  await notes.getByLabel("ATC text").fill("Switch the last screen\nProtect the paint");
  expect(writes).toHaveLength(0);
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(notes.getByLabel("ATC text")).toHaveAttribute("readonly", "");
  expect(writes[0].key).toBe("2022600001:text");
  const other = await context.newPage();
  await other.goto("#/g/2022600001/atc");
  await expect(other.getByLabel("ATC text")).toHaveValue("Switch the last screen\nProtect the paint");
  await other.goto("#/g/2022600002/atc");
  await expect(other.getByLabel("ATC text")).toHaveValue("");
  await other.close();
});

test("Washington ATC does not include the Capital City workspace", async ({ page, context }) => {
  await setup(context, { capitalCity: false });
  await page.goto("#/g/0022600108/atc");
  await expect(page.getByRole("region", { name: "Play-by-play wheel" })).toBeVisible();
  await expect(page.getByRole("region", { name: "ATC Notes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "ATC Drawing", exact: true })).toHaveCount(0);
});

test("drawing locks after Save, persists through resize/reload, and uses separate storage from text", async ({ page, context }) => {
  // Exercise scrolling explicitly: CI fonts/layout can put the canvas below
  // the viewport after clicking Edit in its header.
  await page.setViewportSize({ width: 1280, height: 600 });
  const { saved, writes } = await setup(context);
  await page.goto("#/g/2022600001/atc");
  const section = page.getByRole("region", { name: "ATC Drawing", exact: true });
  const board = section.getByLabel("ATC drawing board");
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(board).toHaveCSS("touch-action", "none");
  await expect(section.getByLabel("Drawing thickness")).toHaveValue("4");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 140, { steps: 10 });
  await page.mouse.up();
  await expect(board).toHaveAttribute("data-stroke-count", "1");
  expect(writes).toHaveLength(0);
  await section.getByRole("button", { name: "Save", exact: true }).click();
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(board).toHaveCSS("touch-action", "pan-y");
  expect(saved.get("2022600001:drawing").payload.strokes).toHaveLength(1);
  expect(saved.has("2022600001:text")).toBe(false);
  await page.reload();
  await expect(board).toHaveAttribute("data-stroke-count", "1");
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(() => board.evaluate(canvas => [...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
  await board.click();
  await expect(board).toHaveAttribute("data-stroke-count", "1");
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  await section.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(board).toHaveAttribute("data-stroke-count", "0");
  page.once("dialog", dialog => dialog.accept());
  await section.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(board).toHaveAttribute("data-stroke-count", "1");
});

test("failed saves and concurrent edits preserve drafts instead of overwriting another user", async ({ page, context }) => {
  const server = await setup(context);
  await page.goto("#/g/2022600001/atc");
  const notes = page.getByRole("region", { name: "ATC Notes", exact: true });
  await notes.getByRole("button", { name: "Edit", exact: true }).click();
  await notes.getByLabel("ATC text").fill("My unsaved notes");
  server.setFailSave(true);
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("alert")).toContainText("Your draft is preserved");
  await expect(notes.getByLabel("ATC text")).toHaveValue("My unsaved notes");
  await expect(notes.getByLabel("ATC text")).not.toHaveAttribute("readonly", "");
  server.setFailSave(false);
  const other = await context.newPage();
  await other.goto("#/g/2022600001/atc");
  const otherNotes = other.getByRole("region", { name: "ATC Notes", exact: true });
  await otherNotes.getByRole("button", { name: "Edit", exact: true }).click();
  await otherNotes.getByLabel("ATC text").fill("Other user's saved notes");
  await otherNotes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherNotes.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("alert")).toContainText("Another user saved changes");
  await expect(notes.getByLabel("ATC text")).toHaveValue("My unsaved notes");
  expect(server.saved.get("2022600001:text").payload.text).toBe("Other user's saved notes");
  page.once("dialog", dialog => dialog.accept());
  await notes.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(notes.getByLabel("ATC text")).toHaveValue("Other user's saved notes");
  await other.close();
});

test("finger and Pencil pointer input draw immediately and saved strokes survive reload", async ({ page, context }) => {
  const { saved } = await setup(context);
  await page.goto("#/g/2022600001/atc");
  const section = page.getByRole("region", { name: "ATC Drawing", exact: true });
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  const board = section.getByLabel("ATC drawing board");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  const cdp = await context.newCDPSession(page);
  const point = { x: box.x + 80, y: box.y + 80, id: 0 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, x: point.x + 100, y: point.y + 60 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(board).toHaveAttribute("data-stroke-count", "1");
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x + 20, y: point.y + 100, button: "left", clickCount: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 200, y: point.y + 120, buttons: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + 200, y: point.y + 120, button: "left", clickCount: 1, pointerType: "pen" });
  await expect(board).toHaveAttribute("data-stroke-count", "2");
  await section.getByRole("button", { name: "Save", exact: true }).click();
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(saved.get("2022600001:drawing").payload.strokes).toHaveLength(2);
  await page.reload();
  await expect(board).toHaveAttribute("data-stroke-count", "2");
  await page.getByRole("group", { name: "Capital City ATC workspace" }).screenshot({ path: "output/capital-city-atc-workspace.png" });
});
