import test from "node:test";
import assert from "node:assert/strict";

import { nextPlaycallSort, sortPlaycallRows } from "./playcallTrackingSort.js";

const rows = [
  { playcall: "Zoom 10", action: "Screen", description: "Third" },
  { playcall: "alpha", action: "Cut", description: "First" },
  { playcall: "Zoom 2", action: "", description: "Second" },
  { playcall: "", action: "Drive", description: "" },
];

test("playcall sorting is case-insensitive, numeric, stable, and leaves blanks last", () => {
  assert.deepEqual(
    sortPlaycallRows(rows, { field: "playcall", direction: "ascending" }).map(({ row }) => row.playcall),
    ["alpha", "Zoom 2", "Zoom 10", ""],
  );
  assert.deepEqual(
    sortPlaycallRows(rows, { field: "playcall", direction: "descending" }).map(({ row }) => row.playcall),
    ["Zoom 10", "Zoom 2", "alpha", ""],
  );
  assert.deepEqual(sortPlaycallRows(rows).map(({ sourceIndex }) => sourceIndex), [0, 1, 2, 3]);
});

test("playcall sorting cycles ascending, descending, and original order", () => {
  const ascending = nextPlaycallSort({}, "action");
  const descending = nextPlaycallSort(ascending, "action");
  assert.deepEqual(ascending, { field: "action", direction: "ascending" });
  assert.deepEqual(descending, { field: "action", direction: "descending" });
  assert.deepEqual(nextPlaycallSort(descending, "action"), { field: "", direction: "" });
  assert.deepEqual(nextPlaycallSort(descending, "description"), { field: "description", direction: "ascending" });
});
