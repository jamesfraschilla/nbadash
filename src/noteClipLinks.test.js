import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomPlaycallClipMeta, buildTimedNoteClipMeta, resolveNoteClipUrl } from "./noteClipLinks.js";

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

test("all timed note tags get clips while only custom Playcall shifts the clock", () => {
  const ordinary = buildTimedNoteClipMeta({ ...note, minutes: 4, seconds: 53, tags: ["Officiating"] });
  assert.equal(ordinary.type, "custom_note");
  assert.equal(new URL(ordinary.clip_url).searchParams.get("inTime"), "19300000");
  assert.ok(buildTimedNoteClipMeta({ ...note, minutes: 4, seconds: 53, tags: [] }));
});

test("live Playcall entry can create the shifted clip before its future event exists", () => {
  const meta = buildCustomPlaycallClipMeta({ ...note, actions: [action("PT05M03.00S")] });
  assert.equal(new URL(meta.clip_url).searchParams.get("inTime"), "19301000");
  assert.equal(new URL(meta.clip_url).searchParams.get("outTime"), "19303000");
});

test("legacy Washington notes resolve new URLs on read without changing saved notes", () => {
  const game = { gameId: note.gameId, awayTeam: { teamId: 1610612764 }, playByPlayActions: [action()] };
  const legacy = { game_id: note.gameId, period_label: "Q1", minutes: 5, seconds: 3, tags: ["Playcall"], text: "Original note",
    source_meta: { clip_url: "https://www.nba.com/stats/events?GameEventID=1" } };
  const before = JSON.stringify(legacy);
  assert.equal(new URL(resolveNoteClipUrl(legacy, game)).searchParams.get("inTime"), "19300000");
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(resolveNoteClipUrl(legacy, { ...game, awayTeam: { teamId: 1610612737 } }), legacy.source_meta.clip_url);
  const pbp = { ...legacy, source_meta: { ...legacy.source_meta, type: "pbp", action_number: 1 } };
  assert.equal(new URL(resolveNoteClipUrl(pbp, game)).searchParams.get("inTime"), "19300000");
  assert.equal(resolveNoteClipUrl({ ...legacy, minutes: null, seconds: null, source_meta: {}, created_at: "2026-10-28T00:00:00Z" }, game), null);
});
