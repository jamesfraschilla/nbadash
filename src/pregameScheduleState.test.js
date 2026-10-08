import assert from "node:assert/strict";
import test from "node:test";
import { chooseSavedPregameSchedule } from "./pregameScheduleState.js";

test("time-only Court Time schedules remain valid saved schedules", () => {
  const remote = {
    updatedAt: 200,
    slots: [{ id: "one", time: "5:05 PM", playerIds: ["", ""] }],
  };
  const local = {
    updatedAt: 100,
    slots: [{ id: "one", time: "4:45 PM", playerIds: ["", ""] }],
  };

  assert.deepEqual(chooseSavedPregameSchedule(remote, local), {
    updatedAt: 200,
    slots: remote.slots,
    source: "remote",
  });
});

test("newer local Court Time edits win over an older remote schedule", () => {
  const remote = { updatedAt: 100, slots: [{ id: "one", time: "4:45 PM", playerIds: [] }] };
  const local = { updatedAt: 200, slots: [{ id: "one", time: "5:05 PM", playerIds: [] }] };

  assert.equal(chooseSavedPregameSchedule(remote, local)?.source, "local");
  assert.equal(chooseSavedPregameSchedule(remote, local)?.slots[0].time, "5:05 PM");
});
