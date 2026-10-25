import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateOfficialCallEvents } from "./officiatingCallDeduplication.js";
import { extractOfficialCallEvents } from "./officiatingParser.js";

test("a multi-victim foul with the same NBA action ID counts as one official decision", () => {
  const event = { gameId: "0022600095", actionNumber: 394, description: "Nesmith FLAGRANT.FOUL.TYPE1 (N.Green)",
    officialId: "1627524", primaryCategory: "foul", sourcePayload: { foulDrawnPersonId: 1 } };
  assert.deepEqual(deduplicateOfficialCallEvents([event, { ...event, sourcePayload: { foulDrawnPersonId: 2 } }]), [event]);
});
test("action numbers are scoped to a game; no-action events use clock and description", () => {
  const a = { gameId: "a", actionNumber: 394, description: "foul" };
  const b = { ...a, gameId: "b" };
  const c = { gameId: "a", actionNumber: null, period: 1, gameClock: "1:00", description: "violation" };
  assert.equal(deduplicateOfficialCallEvents([a, b, c, { ...c }, { ...c, description: "different violation" }]).length, 4);
});
test("conflicting decisions are rejected before any replacement writes", () => {
  assert.throws(() => deduplicateOfficialCallEvents([{ gameId: "a", actionNumber: 1, officialId: "8" },
    { gameId: "a", actionNumber: 1, officialId: "9" }]), /Conflicting officiating events/);
});
test("call extraction deduplicates provider rows and does not coerce missing action IDs to zero", () => {
  const foul = { actionNumber: 394, orderNumber: 1, period: 2, clock: "PT00M59.70S", actionType: "foul", teamTricode: "IND",
    description: "Nesmith FLAGRANT.FOUL.TYPE1 (N.Green)" };
  const game = { gameId: "0022600095", officials: [{ personId: 1627524, name: "Nate Green" }], playByPlayActions: [foul, { ...foul }] };
  assert.equal(extractOfficialCallEvents(game).length, 1);
  const [event] = extractOfficialCallEvents({ ...game, playByPlayActions: [{ ...foul, actionNumber: null }] });
  assert.equal(event.actionNumber, null);
});
