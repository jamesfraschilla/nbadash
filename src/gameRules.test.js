import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTeamFoulInfo,
  getSummerLeagueTimeoutDisplay,
} from "./gameRules.js";

const TEAM_ID = "1610612764";

const foul = (overrides = {}) => ({
  actionType: "foul",
  teamId: TEAM_ID,
  period: 5,
  clock: "PT4M00.00S",
  description: "",
  ...overrides,
});

const timeout = (overrides = {}) => ({
  actionType: "timeout",
  teamId: TEAM_ID,
  period: 5,
  subType: "regular",
  ...overrides,
});

test("Summer League overtime starts with zero fouls displayed", () => {
  assert.deepEqual(
    buildTeamFoulInfo({
      actions: [],
      teamId: TEAM_ID,
      period: 5,
      isSummerLeague: true,
    }),
    { count: 0, inPenalty: false, rawCount: 0 }
  );
});

test("Summer League overtime first team foul displays warning count", () => {
  assert.deepEqual(
    buildTeamFoulInfo({
      actions: [foul({ description: "Personal foul T1" })],
      teamId: TEAM_ID,
      period: 5,
      isSummerLeague: true,
    }),
    { count: 4, inPenalty: false, rawCount: 1 }
  );
});

test("Summer League overtime second team foul displays penalty count", () => {
  assert.deepEqual(
    buildTeamFoulInfo({
      actions: [
        foul({ description: "Personal foul T1" }),
        foul({ description: "Shooting foul T2 PN", clock: "PT3M10.00S" }),
      ],
      teamId: TEAM_ID,
      period: 5,
      isSummerLeague: true,
    }),
    { count: 5, inPenalty: true, rawCount: 2 }
  );
});

test("Summer League regulation keeps NBA last-two-minutes team foul display", () => {
  assert.deepEqual(
    buildTeamFoulInfo({
      actions: [foul({ period: 4, clock: "PT1M30.00S", description: "Personal foul T1" })],
      teamId: TEAM_ID,
      period: 4,
      isSummerLeague: true,
    }),
    { count: 4, inPenalty: false, rawCount: 1 }
  );
});

test("Summer League overtime starts with one available timeout in a two-slot display", () => {
  assert.deepEqual(
    getSummerLeagueTimeoutDisplay({
      actions: [timeout({ period: 4 })],
      teamId: TEAM_ID,
      period: 5,
    }),
    { remaining: 1, total: 2 }
  );
});

test("Summer League overtime timeout is scoped to the current overtime period", () => {
  assert.deepEqual(
    getSummerLeagueTimeoutDisplay({
      actions: [
        timeout({ period: 5 }),
        timeout({ period: 6 }),
      ],
      teamId: TEAM_ID,
      period: 5,
    }),
    { remaining: 0, total: 2 }
  );

  assert.deepEqual(
    getSummerLeagueTimeoutDisplay({
      actions: [timeout({ period: 5 })],
      teamId: TEAM_ID,
      period: 6,
    }),
    { remaining: 1, total: 2 }
  );
});
