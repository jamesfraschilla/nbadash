import test from "node:test";
import assert from "node:assert/strict";
import { reconcileRosterPlayerFields } from "./rosterReconciliation.js";

test("fills a cached blank jersey from the bundled roster snapshot", () => {
  const reconciled = reconcileRosterPlayerFields(
    [{ personId: "1642369", fullName: "Michael Ajayi", jerseyNum: "", teamId: "1610612766" }],
    [{ personId: "1642369", fullName: "Michael Ajayi", jerseyNum: "10", teamId: "1610612766" }],
  );
  assert.equal(reconciled[0].jerseyNum, "10");
});

test("keeps a newer remote jersey over the bundled snapshot", () => {
  const reconciled = reconcileRosterPlayerFields(
    [{ personId: "1", fullName: "Sample Player", jerseyNum: "18" }],
    [{ personId: "1", fullName: "Sample Player", jerseyNum: "8" }],
  );
  assert.equal(reconciled[0].jerseyNum, "18");
});

test("does not restore players omitted from a nonempty live roster", () => {
  const reconciled = reconcileRosterPlayerFields(
    [{ personId: "1", fullName: "Current Player", jerseyNum: "1" }],
    [
      { personId: "1", fullName: "Current Player", jerseyNum: "1" },
      { personId: "2", fullName: "Departed Player", jerseyNum: "2" },
    ],
  );
  assert.deepEqual(reconciled.map((player) => player.personId), ["1"]);
});

test("uses normalized names when one source lacks a matching player id", () => {
  const reconciled = reconcileRosterPlayerFields(
    [{ personId: "espn-2", fullName: "Tidjane Salaun", jerseyNum: "" }],
    [{ personId: "nba-2", fullName: "Tidjane Salaün", jerseyNum: "31" }],
  );
  assert.equal(reconciled[0].personId, "espn-2");
  assert.equal(reconciled[0].jerseyNum, "31");
});
