import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateKpiRowTotal,
  createDefaultKpiTablePayload,
  mergeKpiTablePayload,
  normalizeKpiTablePayload,
  updateKpiTableField,
} from "./kpiTableState.js";

test("KPI tables default to three Defense and Offense rows", () => {
  const payload = createDefaultKpiTablePayload();
  assert.equal(payload.defense.length, 3);
  assert.equal(payload.offense.length, 3);
  assert.deepEqual(payload.defense.map((row) => row.id), ["defense-1", "defense-2", "defense-3"]);
});

test("KPI totals sum four quarter values and preserve a meaningful zero", () => {
  assert.equal(calculateKpiRowTotal({ q1: "2", q2: "3.5", q3: "-1", q4: "0.5" }), "5");
  assert.equal(calculateKpiRowTotal({ q1: "0", q2: "", q3: "", q4: "" }), "0");
  assert.equal(calculateKpiRowTotal({ q1: "", q2: "", q3: "", q4: "" }), "");
});

test("KPI table merge resolves each field independently by timestamp", () => {
  let first = createDefaultKpiTablePayload();
  first = updateKpiTableField(first, "defense", 0, "label", "Paint points", 10);
  first = updateKpiTableField(first, "defense", 0, "q1", "8", 20);
  let second = createDefaultKpiTablePayload();
  second = updateKpiTableField(second, "defense", 0, "label", "Old label", 5);
  second = updateKpiTableField(second, "defense", 0, "q1", "10", 30);
  const merged = mergeKpiTablePayload(first, second);
  assert.equal(merged.defense[0].label, "Paint points");
  assert.equal(merged.defense[0].q1, "10");
  assert.equal(normalizeKpiTablePayload({}).offense.length, 3);
});
