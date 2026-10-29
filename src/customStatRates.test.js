import test from "node:test";
import assert from "node:assert/strict";
import { threePointOffensiveReboundPercent, reconcileShotZoneTotals } from "./customStatRates.js";

test("WAS–CLE halftime 3P-OR% uses 4 of 9 missed threes, not 4 of 4 OReb", () => {
  assert.equal(threePointOffensiveReboundPercent({ threePointOReb: 4, reboundsOffensive: 4,
    threePointersMade: 3, threePointersAttempted: 12 }).toFixed(1), "44.4");
  assert.equal(threePointOffensiveReboundPercent({ threePointOReb: 8,
    threePointersMade: 8, threePointersAttempted: 21 }).toFixed(1), "61.5");
  assert.equal(threePointOffensiveReboundPercent({}), 0);
  assert.equal(threePointOffensiveReboundPercent({ threePointersMade: 2, threePointersAttempted: 2 }), 0);
});

test("team zones agree with segment/player zones only when shot coverage is complete", () => {
  const base = { fieldGoalsMade: 28, fieldGoalsAttempted: 45, points: 69, rimFieldGoalsMade: 17 };
  const derived = { fieldGoalsMade: 28, fieldGoalsAttempted: 45, points: 0, rimFieldGoalsMade: 18,
    rimFieldGoalsAttempted: 20, midFieldGoalsMade: 7, midFieldGoalsAttempted: 13 };
  assert.equal(reconcileShotZoneTotals(base, derived).rimFieldGoalsMade, 18);
  assert.equal(reconcileShotZoneTotals(base, derived).points, 69);
  assert.equal(reconcileShotZoneTotals(base, { ...derived, fieldGoalsAttempted: 44 }), base);
});
