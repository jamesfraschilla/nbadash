import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamRebounds, findIncompletePersonalFoulFeed } from "./teamStatNormalization.js";

test("full-game rebound totals use the player definition without changing other statistics", () => {
  const totals = { points: 5, reboundsTotal: 45, reboundsOffensive: 9, foulsPersonal: 36 };
  assert.deepEqual(normalizeTeamRebounds(totals, [{ points: 2, reboundsTotal: 20, reboundsOffensive: 5 }, { points: 3, reboundsTotal: 11, reboundsOffensive: 4 }]), { ...totals, reboundsTotal: 31 });
  assert.equal(normalizeTeamRebounds(totals, [{ points: 2, reboundsTotal: 20 }]), totals);
});

test("missing source fouls are reported, not silently assigned to a period", () => {
  const warnings = findIncompletePersonalFoulFeed({ away: { teamId: 1, teamTricode: "DET", totals: { foulsPersonal: 36 } } }, { 1: { foulsPersonal: 35 } });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /36 personal fouls.*35/);
});
