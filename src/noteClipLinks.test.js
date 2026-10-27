import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomPlaycallClipMeta } from "./noteClipLinks.js";

const action = (clock = "PT04M53.00S", extra = {}) => ({
  actionNumber: 1, period: 1, clock, actionType: "2pt", timeActual: "2026-10-26T23:30:10Z", ...extra,
});
const note = { gameId: "0022600119", periodLabel: "Q1", minutes: 5, seconds: 3, tags: ["Playcall"], actions: [action()] };

test("Q1 5:03 Playcall uses the Q1 4:53 event with the normal ten-second lead-in", () => {
  const before = JSON.stringify(note);
  const meta = buildCustomPlaycallClipMeta(note);
  const params = new URL(meta.clip_url).searchParams;
  assert.equal(params.get("inTime"), "19300000");
  assert.equal(params.get("outTime"), "19302000");
  assert.equal(meta.type, "custom_playcall");
  assert.equal(JSON.stringify(note), before);
  assert.equal(note.minutes, 5);
  assert.equal(note.seconds, 3);
});

test("custom notes support other NBA games without broadening the play-by-play trial", () => {
  assert.equal(new URL(buildCustomPlaycallClipMeta({ ...note, gameId: "0022600108" }).clip_url).searchParams.get("gameNo"), "0022600108");
  assert.equal(buildCustomPlaycallClipMeta({ ...note, gameId: "2012600001" }), null);
});

test("ordinary notes, incomplete clocks, wrong periods, and missing timestamps do not get invented clips", () => {
  for (const patch of [{ tags: ["Halftime"] }, { periodLabel: "--" }, { minutes: null }, { seconds: null },
    { minutes: 13 }, { seconds: 60 }, { minutes: 0, seconds: 5 }, { actions: [] },
    { actions: [action(undefined, { period: 2 })] }, { actions: [action(undefined, { timeActual: null })] }]) {
    assert.equal(buildCustomPlaycallClipMeta({ ...note, ...patch }), null);
  }
});

test("small running-clock gaps are interpolated, but not across a stoppage or a distant event", () => {
  const nearby = action("PT04M55.00S");
  assert.equal(new URL(buildCustomPlaycallClipMeta({ ...note, actions: [nearby] }).clip_url).searchParams.get("inTime"), "19300200");
  assert.equal(buildCustomPlaycallClipMeta({ ...note, actions: [action("PT04M59.00S")] }), null);
  assert.equal(buildCustomPlaycallClipMeta({ ...note, actions: [nearby, action("PT04M54.00S", { actionType: "timeout" })] }), null);
});

test("duplicate clock events use the earliest actual timestamp, not a later dead-ball entry", () => {
  const meta = buildCustomPlaycallClipMeta({ ...note, actions: [
    action(undefined, { timeActual: "2026-10-26T23:32:10Z" }), action(),
  ] });
  assert.equal(new URL(meta.clip_url).searchParams.get("inTime"), "19300000");
});

test("ambiguous multiple overtimes never borrow the wrong period's timestamp", () => {
  const otNote = { ...note, periodLabel: "OT", minutes: 3, seconds: 0,
    actions: [action("PT02M50.00S", { period: 5 })] };
  assert.ok(buildCustomPlaycallClipMeta(otNote));
  assert.equal(buildCustomPlaycallClipMeta({ ...otNote, actions: [...otNote.actions, action("PT02M50.00S", { period: 6 })] }), null);
});
