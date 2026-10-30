import test from "node:test";
import assert from "node:assert/strict";
import { selectHistoricalBookEvidence } from "./officiatingHistoricalEvidence.js";

const log = { period: 1, game_clock: "06:11", challenging_team: "BOS", challenge_type: "Foul", challenge_outcome: "successful" };
const book = { period: 2, gameClock: "06:11", challengingTeamName: "Celtics", challengeType: "Foul", outcome: "successful" };
test("historical PDF quarter typo can be resolved only by exclusive team/type/outcome evidence", () => {
  assert.equal(selectHistoricalBookEvidence(log, [log], [book]).book.period, 2);
  assert.equal(selectHistoricalBookEvidence(log, [log], [book, { ...book, gameClock: "04:10" }]), null);
  assert.equal(selectHistoricalBookEvidence(log, [log], [{ ...book, challengingTeamName: "Trail Blazers" }]), null);
  assert.equal(selectHistoricalBookEvidence(log, [log], [{ ...book, outcome: "unsuccessful" }]), null);
});
test("a book row already claimed by another log cannot be reused for a different challenge", () => {
  const other = { ...log, period: 2 };
  assert.equal(selectHistoricalBookEvidence(log, [log, other], [book]), null);
});
test("exact-clock challenges for opposite teams cannot swap whistling officials", () => {
  const second = { ...book, challengingTeamName: "Knicks" };
  assert.equal(selectHistoricalBookEvidence({ ...log, period: 2 }, [log], [book, second]).book, book);
});

test("exact identity retains conflicting call evidence for review, not a nearby-category guess", () => {
  const conflicting = { ...book, period: 1, challengeType: "OOB" };
  assert.equal(selectHistoricalBookEvidence(log, [log], [conflicting]).book, conflicting);
  assert.equal(selectHistoricalBookEvidence(log, [log], [{ ...conflicting, gameClock: "06:10" }]), null);
});
