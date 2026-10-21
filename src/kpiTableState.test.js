import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultKpiTablePayload,
  mergeKpiTablePayload,
  normalizeKpiTablePayload,
  updateKpiTableField,
  kpiTableTemplate,
} from "./kpiTableState.js";

test("KPI tables default to three Defense and Offense rows", () => {
  const payload = createDefaultKpiTablePayload();
  assert.equal(payload.defense.length, 3);
  assert.equal(payload.offense.length, 3);
  assert.deepEqual(payload.defense.map((row) => row.id), ["defense-1", "defense-2", "defense-3"]);
  assert.equal(payload.defense[0].total, "");
});

test("KPI totals are independent free-text values", () => {
  let payload = normalizeKpiTablePayload({ defense: [{ q1: "2", q2: "3", total: "Coach's total: 6" }] });
  assert.equal(payload.defense[0].total, "Coach's total: 6");
  payload = updateKpiTableField(payload, "defense", 0, "total", "Final", 20);
  assert.equal(payload.defense[0].total, "Final");
  assert.equal(normalizeKpiTablePayload({ defense: [{ q1: "2" }] }).defense[0].total, "");
});

test("existing KPI values survive adding saved fullscreen colors", () => {
  const existing = { updatedAt: 10, defense: [{ label: "Kills", q1: "2", q2: "3", total: "5" }] };
  const normalized = normalizeKpiTablePayload(existing);
  assert.equal(normalized.defense[0].color, "default");
  const colored = updateKpiTableField(normalized, "defense", 0, "color", "green", 20);
  const merged = mergeKpiTablePayload(normalized, colored);
  assert.equal(merged.defense[0].color, "green");
  assert.equal(merged.defense[0].label, "Kills");
  assert.equal(merged.defense[0].q1, "2");
  assert.equal(merged.defense[0].q2, "3");
  assert.equal(merged.defense[0].total, "5");
  assert.equal(normalizeKpiTablePayload({ offense: [{ color: "invalid" }] }).offense[0].color, "default");
});

test("future-game templates retain labels and colors but never previous game statistics", () => {
  const original = { defense: [{ label: "Kills", color: "green", q1: "2", q2: "3", total: "5" }] };
  const template = kpiTableTemplate(original);
  assert.equal(template.defense[0].label, "Kills");
  assert.equal(template.defense[0].color, "green");
  for (const field of ["q1", "q2", "q3", "q4", "total"]) assert.equal(template.defense[0][field], "");
  assert.equal(original.defense[0].total, "5");
});

test("KPI table merge resolves each field independently by timestamp", () => {
  let first = createDefaultKpiTablePayload();
  first = updateKpiTableField(first, "defense", 0, "label", "Paint points", 10);
  first = updateKpiTableField(first, "defense", 0, "q1", "8", 20);
  let second = createDefaultKpiTablePayload();
  second = updateKpiTableField(second, "defense", 0, "label", "Old label", 5);
  second = updateKpiTableField(second, "defense", 0, "q1", "10", 30);
  second = updateKpiTableField(second, "defense", 0, "total", "Ten", 40);
  const merged = mergeKpiTablePayload(first, second);
  assert.equal(merged.defense[0].label, "Paint points");
  assert.equal(merged.defense[0].q1, "10");
  assert.equal(merged.defense[0].total, "Ten");
  assert.equal(normalizeKpiTablePayload({}).offense.length, 3);
});
