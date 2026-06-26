import test from "node:test";
import assert from "node:assert/strict";
import { formatDateInputInTimeZone, seasonBoundsForSeason } from "./utils.js";

test("formatDateInputInTimeZone uses Eastern date boundaries for default NBA day", () => {
  assert.equal(
    formatDateInputInTimeZone(new Date("2026-05-25T02:30:00Z"), "America/New_York"),
    "2026-05-24",
  );

  assert.equal(
    formatDateInputInTimeZone(new Date("2026-05-25T05:30:00Z"), "America/New_York"),
    "2026-05-25",
  );
});

test("seasonBoundsForSeason uses the requested season dates", () => {
  const { start, end } = seasonBoundsForSeason("2024-25", new Date("2026-01-15T12:00:00Z"));

  assert.equal(start.getFullYear(), 2024);
  assert.equal(start.getMonth(), 9);
  assert.equal(start.getDate(), 1);
  assert.equal(end.getFullYear(), 2025);
  assert.equal(end.getMonth(), 5);
  assert.equal(end.getDate(), 30);
});

test("seasonBoundsForSeason clamps an in-progress season to the current date", () => {
  const { start, end } = seasonBoundsForSeason("2025-26", new Date("2026-01-15T12:00:00Z"));

  assert.equal(start.getFullYear(), 2025);
  assert.equal(start.getMonth(), 9);
  assert.equal(start.getDate(), 1);
  assert.equal(end.getFullYear(), 2026);
  assert.equal(end.getMonth(), 0);
  assert.equal(end.getDate(), 15);
});
