import test from "node:test";
import assert from "node:assert/strict";
import { createTeamScheduleResultsLoader } from "./teamScheduleResults.js";

const fixture = (gameId, gameDate, gameStatus = 1) => ({ gameId, gameDate, gameStatus,
  seasonType: "Regular Season", homeTeam: { teamId: 1, score: 0 }, awayTeam: { teamId: 2, score: 0 } });
const now = () => Date.parse("2026-10-26T12:00:00-04:00");

test("past fixtures acquire confirmed scores without changing future games or cached finals", async () => {
  const first = fixture("1", "2026-10-21");
  const final = { ...fixture("2", "2026-10-23", 3), homeTeam: { score: 128 } };
  const future = fixture("3", "2026-10-28");
  const calls = [];
  const load = createTeamScheduleResultsLoader(async (date) => {
    calls.push(date);
    return [{ ...first, gameStatus: 3, gameStatusText: "Final", homeTeam: { teamId: 1, score: 128 }, awayTeam: { teamId: 2, score: 116 } }];
  }, { now });
  const results = await load([first, final, future]);
  assert.deepEqual(calls, ["2026-10-21"]);
  assert.equal(results[0].gameStatus, 3);
  assert.equal(results[0].homeTeam.score, 128);
  assert.equal(results[0].awayTeam.score, 116);
  assert.equal(results[0].seasonType, "Regular Season");
  assert.equal(results[1], final);
  assert.equal(results[2], future);
  assert.equal(first.gameStatus, 1);
});

test("concurrent teams share date requests and live scores refresh after 30 seconds", async () => {
  let time = now();
  let calls = 0;
  const source = fixture("1", "2026-10-26");
  const load = createTeamScheduleResultsLoader(async () => {
    calls++;
    return [{ ...source, gameStatus: 2, homeTeam: { score: calls } }];
  }, { now: () => time });
  const [one, two] = await Promise.all([load([source]), load([source])]);
  assert.equal(calls, 1);
  assert.equal(one[0].homeTeam.score, two[0].homeTeam.score);
  time += 30_001;
  const refreshed = await load(one);
  assert.equal(calls, 2);
  assert.equal(refreshed[0].homeTeam.score, 2);
});

test("failed and pregame scoreboards preserve fixtures and retry rather than inventing results", async () => {
  let time = now();
  let calls = 0;
  const source = fixture("1", "2026-10-21");
  const load = createTeamScheduleResultsLoader(async () => {
    calls++;
    if (calls === 1) throw new Error("unavailable");
    return [source];
  }, { now: () => time });
  assert.equal((await load([source]))[0], source);
  assert.equal((await load([source]))[0], source);
  assert.equal(calls, 1);
  time += 30_001;
  assert.equal((await load([source]))[0], source);
  assert.equal(calls, 2);
});

test("scoreboard loading is bounded to four simultaneous requests", async () => {
  let active = 0;
  let peak = 0;
  const load = createTeamScheduleResultsLoader(async () => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return [];
  }, { now });
  await load(Array.from({ length: 10 }, (_, index) => fixture(String(index), `2026-10-${String(index + 1).padStart(2, "0")}`)));
  assert.equal(peak, 4);
});
