import test from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardMatchupLineup } from "./matchupDashboardLineups.js";

const rosterIds = ["1", "2", "3", "4", "5", "6", "7"];

test("uses projected starters before roster order when five confirmed starters are unavailable", () => {
  assert.deepEqual(resolveDashboardMatchupLineup({
    confirmedStarterIds: ["1", "2"],
    projectedStarterIds: ["7", "6", "5", "4", "3"],
    rosterIds,
  }), ["7", "6", "5", "4", "3"]);
});

test("uses all five confirmed starters ahead of projected starters", () => {
  assert.deepEqual(resolveDashboardMatchupLineup({
    confirmedStarterIds: ["1", "2", "3", "4", "5"],
    projectedStarterIds: ["7", "6", "5", "4", "3"],
    rosterIds,
  }), ["1", "2", "3", "4", "5"]);
});

test("keeps a live current lineup as the highest-priority automatic lineup", () => {
  assert.deepEqual(resolveDashboardMatchupLineup({
    currentLineupIds: ["3", "4", "5", "6", "7"],
    confirmedStarterIds: ["1", "2", "3", "4", "5"],
    projectedStarterIds: ["7", "6", "5", "4", "3"],
    rosterIds,
  }), ["3", "4", "5", "6", "7"]);
});
