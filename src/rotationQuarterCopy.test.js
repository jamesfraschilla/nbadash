import test from "node:test";
import assert from "node:assert/strict";
import { copyQuarterMinutes, quarterHasMinutes } from "./rotationQuarterCopy.js";
test("copies every selection and blank independently without changing source or other quarters", () => {
  for (const minutes of [10, 12]) {
    const source = Array.from({ length: minutes }, (_, i) => [i < 6 ? "YOUNG" : "BUB", "", "GEORGE", "DAVIS", "SARR"]);
    const lineups = { 1: [["KEEP"]], 2: source, 3: [["OLD"]], 4: [["UNCHANGED"]] };
    const before = JSON.stringify(lineups);
    const next = copyQuarterMinutes(lineups, 2, 3);
    assert.deepEqual(next[3], source);
    assert.notEqual(next[3], source);
    assert.equal(next[1], lineups[1]);
    assert.equal(next[4], lineups[4]);
    next[3][0][0] = "EDIT";
    assert.equal(JSON.stringify(lineups), before);
    assert.equal(copyQuarterMinutes(lineups, 2, 2), lineups);
    assert.equal(copyQuarterMinutes(lineups, 0, 3), lineups);
  }
});
test("any existing selection needs overwrite consent, including a partially filled quarter", () => {
  assert.equal(quarterHasMinutes([["", " "], ["", ""]]), false);
  assert.equal(quarterHasMinutes([["", ""], ["", "YOUNG"]]), true);
  assert.equal(quarterHasMinutes(undefined), false);
});
