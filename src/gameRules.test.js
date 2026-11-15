import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChallengeCircles,
  deriveGameChallenges,
  getGLeagueTimeoutDisplay,
  buildTeamFoulInfo,
  getSummerLeagueTimeoutDisplay,
} from "./gameRules.js";

const TEAM_ID = "1610612764";

test("G League always has two independent challenges, even after a loss or with no timeouts", () => {
  const states = (total, won) => buildChallengeCircles({ challengesTotal: total, challengesWon: won }, true).map(circle => circle.state);
  assert.deepEqual(states(0, 0), ["available", "available"]);
  assert.deepEqual(states(1, 0), ["lost", "available"]);
  assert.deepEqual(states(1, 1), ["won", "available"]);
  assert.deepEqual(states(2, 0), ["lost", "lost"]);
  assert.deepEqual(states(2, 1), ["won", "lost"]);
  assert.deepEqual(states(2, 2), ["won", "won"]);
  assert.deepEqual(buildChallengeCircles(undefined, true), [{ state: "available" }, { state: "available" }]);
  assert.deepEqual(buildChallengeCircles({ challengesTotal: 1, challengesWon: 0 }), [{ state: "lost" }]);
  assert.deepEqual(buildChallengeCircles({ challengesTotal: 1, challengesWon: 1 }), [{ state: "won" }, { state: "available" }]);
  assert.deepEqual(buildChallengeCircles(), [{ state: "available" }]);
});

test("NBA challenge icons follow play-by-play team and outcome, including a pending review", () => {
  const game = {
    homeTeam: { teamId: 1, teamTricode: "WAS" },
    awayTeam: { teamId: 2, teamTricode: "DET" },
    playByPlayActions: [
      { actionType: "timeout", subType: "challenge", teamId: 2, period: 3, clock: "PT01M00.00S" },
      { actionType: "instantreplay", subType: "challenge", descriptor: "support", teamTricode: "DET", period: 3, clock: "PT01M00.00S" },
      { actionType: "instantreplay", subType: "challenge", descriptor: "overturned", teamId: 1, period: 4, clock: "PT02M00.00S" },
      { actionType: "instantreplay", subType: "challenge", teamId: 1, period: 4, clock: "PT00M30.00S" },
      { actionType: "instantreplay", subType: "request", descriptor: "overturned", period: 4, clock: "PT00M10.00S" },
    ],
  };
  const challenges = deriveGameChallenges(game);
  assert.deepEqual(buildChallengeCircles(challenges.away).map((circle) => circle.state), ["lost"]);
  assert.deepEqual(buildChallengeCircles(challenges.home).map((circle) => circle.state), ["won", "pending"]);
  assert.equal(challenges.away.challengesTotal, 1);
  assert.equal(challenges.home.challengesWon, 1);
});

test("G League challenge icons update independently from play-by-play", () => {
  const game = {
    homeTeam: { teamId: 1, teamTricode: "SLC" },
    awayTeam: { teamId: 2, teamTricode: "RCR" },
    playByPlayActions: [
      { actionType: "instantreplay", subType: "challenge", descriptor: "overturned", teamTricode: "RCR", period: 2, clock: "PT08M53.00S" },
      { actionType: "instantreplay", subType: "challenge", descriptor: "overturned", teamTricode: "SLC", period: 4, clock: "PT11M35.00S" },
    ],
  };
  const challenges = deriveGameChallenges(game);
  assert.deepEqual(buildChallengeCircles(challenges.away, true).map((circle) => circle.state), ["won", "available"]);
  assert.deepEqual(buildChallengeCircles(challenges.home, true).map((circle) => circle.state), ["won", "available"]);
  assert.deepEqual(deriveGameChallenges({ ...game, playByPlayActions: [], challenges: { home: { challengesTotal: 1, challengesWon: 0 } } }).home,
    { challengesTotal: 1, challengesWon: 0 });
});

test("G League counts five regular timeouts and a single separate Reset without charging challenges", () => {
  const timeout = (subType, extra = {}) => ({ actionType: "timeout", subType, teamId: TEAM_ID, period: 1, ...extra });
  const actions = [timeout("regular"), timeout("reset"), timeout("challenge"),
    timeout("regular", { description: "Coach's Challenge" }), timeout("officials"),
    timeout("regular", { teamId: "other" }), timeout("regular", { period: 4 }), timeout("mandatory")];
  const options = { actions, teamId: TEAM_ID, period: 2 };
  assert.deepEqual(getGLeagueTimeoutDisplay(options), { total: 5, remaining: 3, resetUsed: true });
  assert.deepEqual(getGLeagueTimeoutDisplay({ ...options, isPregame: true }), { total: 5, remaining: 5, resetUsed: false });
  assert.deepEqual(getGLeagueTimeoutDisplay({ ...options, actions: [] }), { total: 5, remaining: 5, resetUsed: false });
  assert.deepEqual(getGLeagueTimeoutDisplay({ ...options, actions: Array.from({ length: 7 }, () => timeout("regular")) }), { total: 5, remaining: 0, resetUsed: false });
  // A Reset already used is not replenished just by entering overtime.
  assert.equal(getGLeagueTimeoutDisplay({ ...options, period: 5 }).resetUsed, true);
});

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
