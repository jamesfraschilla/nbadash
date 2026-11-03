import test from "node:test";
import assert from "node:assert/strict";
import { challengeSuccessStyle } from "./challengeSuccessStyle.js";

test("100% is green even with one or four challenges and no eligible rank", () => {
  assert.equal(challengeSuccessStyle(1, 1).color, "hsl(138 88% 82%)");
  assert.deepEqual(challengeSuccessStyle(1, 4), challengeSuccessStyle(1, 25));
  assert.equal(challengeSuccessStyle(0, 4).color, "hsl(0 88% 82%)");
  assert.equal(challengeSuccessStyle(0.5, 4).color, "hsl(69 88% 82%)");
});
test("absent observations are neutral, not red", () => {
  assert.equal(challengeSuccessStyle(0, 0), undefined);
  assert.equal(challengeSuccessStyle(null, 4), undefined);
  assert.equal(challengeSuccessStyle(NaN, 4), undefined);
});
