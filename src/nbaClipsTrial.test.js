import test from "node:test";
import assert from "node:assert/strict";
import { nbaClipsUrl, washingtonEventClipUrl } from "./nbaClipsTrial.js";

test("WAS–CHA event timestamps produce Eastern timecoded twenty-second clips", () => {
  const url = new URL(nbaClipsUrl("0022600119", { timeActual: "2026-10-26T23:11:58Z" }));
  assert.equal(url.origin, "https://clips.nba.com");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    gameNo: "0022600119", inTime: "19114800", outTime: "19120800", source: "grs",
  });
});

test("UTC midnight and explicit UTC offsets preserve the correct Eastern game time", () => {
  const utc = nbaClipsUrl("0022600119", { timeActual: "2026-10-27T00:57:11Z" });
  assert.equal(new URL(utc).searchParams.get("inTime"), "20570100");
  assert.equal(utc, nbaClipsUrl("0022600119", { timeActual: "2026-10-26T20:57:11-04:00" }));
});

test("all Washington games get the new URLs while other teams remain unchanged", () => {
  const action = { timeActual: "2026-10-26T23:11:58Z" };
  assert.ok(washingtonEventClipUrl({ gameId: "0022600108", homeTeam: { teamId: 1610612764 } }, action));
  assert.ok(washingtonEventClipUrl({ gameId: "0022600119", awayTeam: { teamTricode: "WAS" } }, action));
  assert.equal(washingtonEventClipUrl({ gameId: "0022600108", homeTeam: { teamTricode: "ATL" } }, action), null);
});

test("unavailable or ambiguous timestamps never generate invented video links", () => {
  for (const timeActual of [undefined, "", "invalid", "2026-10-26T23:11:58", "2026-99-99T00:00:00Z"]) {
    assert.equal(nbaClipsUrl("0022600119", { timeActual }), null);
  }
});
