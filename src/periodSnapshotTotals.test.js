import test from "node:test";
import assert from "node:assert/strict";
import { buildCompletedPeriodSnapshots } from "./periodSnapshotTotals.js";
const fixture = () => ({ gameId: "0012600001", homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 },
  boxScore: { home: { totals: { points: 100 } } }, playByPlayActions: [
    { period: 1, actionNumber: 1, clock: "12:00", actionType: "period", subType: "start", scoreHome: "0", scoreAway: "0" },
    { period: 1, actionNumber: 2, clock: "1:00", actionType: "2pt", teamId: 1, personId: 11, shotResult: "Made", scoreHome: "2", scoreAway: "0" },
    { period: 1, actionNumber: 3, clock: "0:00", actionType: "period", subType: "end", scoreHome: "2", scoreAway: "0" },
    { period: 2, actionNumber: 4, clock: "10:00", actionType: "3pt", teamId: 2, personId: 22, shotResult: "Made", scoreHome: "2", scoreAway: "3" },
  ] });
test("delayed snapshots use historical period data, not the current box score", () => {
  const snapshots = buildCompletedPeriodSnapshots(fixture());
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].totals.points, 2);
  assert.equal(snapshots[1].totals.points, 0);
  assert.equal(snapshots[0].totals._captureVersion, 2);
});
test("unverifiable quarter snapshots are rejected instead of persisting incorrect totals", () => {
  const game = fixture(); game.playByPlayActions[2].scoreHome = "5";
  assert.throws(() => buildCompletedPeriodSnapshots(game), /Cannot verify/);
});
