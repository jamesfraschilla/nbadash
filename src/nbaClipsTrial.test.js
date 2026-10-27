import test from "node:test";
import assert from "node:assert/strict";
import { nbaClipsTrialUrl } from "./nbaClipsTrial.js";

test("WAS–CHA event timestamps produce Eastern timecoded twenty-second clips", () => {
  const url = new URL(nbaClipsTrialUrl("0022600119", { timeActual: "2026-10-26T23:11:58Z" }));
  assert.equal(url.origin, "https://clips.nba.com");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    gameNo: "0022600119", inTime: "19114800", outTime: "19120800", source: "grs",
  });
});

test("UTC midnight and explicit UTC offsets preserve the correct Eastern game time", () => {
  const utc = nbaClipsTrialUrl("0022600119", { timeActual: "2026-10-27T00:57:11Z" });
  assert.equal(new URL(utc).searchParams.get("inTime"), "20570100");
  assert.equal(utc, nbaClipsTrialUrl("0022600119", { timeActual: "2026-10-26T20:57:11-04:00" }));
});

test("other games and unavailable or ambiguous timestamps retain original video links", () => {
  assert.equal(nbaClipsTrialUrl("0022600108", { timeActual: "2026-10-26T23:11:58Z" }), null);
  for (const timeActual of [undefined, "", "invalid", "2026-10-26T23:11:58", "2026-99-99T00:00:00Z"]) {
    assert.equal(nbaClipsTrialUrl("0022600119", { timeActual }), null);
  }
});
