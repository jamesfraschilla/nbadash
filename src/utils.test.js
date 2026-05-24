import test from "node:test";
import assert from "node:assert/strict";
import { formatDateInputInTimeZone } from "./utils.js";

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
