import assert from "node:assert/strict";
import test from "node:test";
import { buildMatchupRosterPool } from "./rosterPools.js";

const WIZARDS_TEAM_ID = "1610612764";

test("summer league matchup rosters use game roster instead of current NBA roster", () => {
  const roster = buildMatchupRosterPool({
    teamId: WIZARDS_TEAM_ID,
    liveRosterTeams: {
      [WIZARDS_TEAM_ID]: {
        players: [
          { personId: "regular-1", fullName: "Regular Wizard" },
        ],
      },
    },
    gameRosterPlayers: [
      { personId: "summer-1", firstName: "Summer", familyName: "Wizard" },
    ],
    isSummerLeague: true,
  });

  assert.deepEqual(roster.map((player) => player.personId), ["summer-1"]);
});

test("summer league scoped rosters merge shared summer roster without current NBA roster leaks", () => {
  const roster = buildMatchupRosterPool({
    teamId: WIZARDS_TEAM_ID,
    teamScope: "washington_summer",
    sharedPlayers: [
      { personId: "shared-1", fullName: "Shared Summer" },
    ],
    liveRosterTeams: {
      [WIZARDS_TEAM_ID]: {
        players: [
          { personId: "regular-1", fullName: "Regular Wizard" },
        ],
      },
    },
    gameRosterPlayers: [
      { personId: "summer-1", firstName: "Game", familyName: "Summer" },
    ],
    isSummerLeague: true,
  });

  assert.deepEqual(roster.map((player) => player.personId), ["shared-1", "summer-1"]);
});

test("regular matchup rosters still use current roster data", () => {
  const roster = buildMatchupRosterPool({
    teamId: WIZARDS_TEAM_ID,
    liveRosterTeams: {
      [WIZARDS_TEAM_ID]: {
        players: [
          { personId: "regular-1", fullName: "Regular Wizard" },
        ],
      },
    },
    gameRosterPlayers: [
      { personId: "summer-1", firstName: "Summer", familyName: "Wizard" },
    ],
    isSummerLeague: false,
  });

  assert.deepEqual(roster.map((player) => player.personId), ["regular-1"]);
});
