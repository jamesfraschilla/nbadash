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

test("summer league matchup rosters keep DNP game roster players available", () => {
  const roster = buildMatchupRosterPool({
    teamId: "1610612760",
    gameRosterPlayers: [
      { personId: "1649991", firstName: "Josh", familyName: "Dix", minutes: "PT12M04.00S" },
      { personId: "1649992", firstName: "Jabri", familyName: "Abdur-Rahim", minutes: "PT00M00.00S", notPlayingReason: "DNP - Coach's Decision" },
    ],
    isSummerLeague: true,
  });

  assert.deepEqual(roster.map((player) => player.personId), ["1649991", "1649992"]);
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

test("summer league scoped rosters keep shared players without NBA player IDs", () => {
  const roster = buildMatchupRosterPool({
    teamId: WIZARDS_TEAM_ID,
    teamScope: "washington_summer",
    sharedPlayers: [
      { id: "norris-agbakoko-row", name: "NORRIS AGBAKOKO", display: "NORRIS", personId: "" },
      { id: "seth-trimble-row", name: "SETH TRIMBLE", display: "SETH", personId: "" },
    ],
    gameRosterPlayers: [],
    isSummerLeague: true,
  });

  assert.deepEqual(roster.map((player) => player.personId), [
    `manual:${WIZARDS_TEAM_ID}:norris-agbakoko-row`,
    `manual:${WIZARDS_TEAM_ID}:seth-trimble-row`,
  ]);
  assert.deepEqual(roster.map((player) => player.headshotPersonId), [
    `manual:${WIZARDS_TEAM_ID}:norris-agbakoko-row`,
    `manual:${WIZARDS_TEAM_ID}:seth-trimble-row`,
  ]);
  assert.deepEqual(roster.map((player) => player.headshotOverrideKeys), [
    [`manual:${WIZARDS_TEAM_ID}:norris-agbakoko-row`],
    [`manual:${WIZARDS_TEAM_ID}:seth-trimble-row`],
  ]);
});

test("summer league scoped roster players upgrade to official IDs when game data matches by name", () => {
  const roster = buildMatchupRosterPool({
    teamId: WIZARDS_TEAM_ID,
    teamScope: "washington_summer",
    sharedPlayers: [
      { id: "norris-agbakoko-row", name: "NORRIS AGBAKOKO", display: "NORRIS", personId: "", cap: 40 },
    ],
    gameRosterPlayers: [
      { personId: "1649999", firstName: "Norris", familyName: "Agbakoko" },
    ],
    isSummerLeague: true,
  });

  assert.equal(roster.length, 1);
  assert.equal(roster[0].personId, "1649999");
  assert.equal(roster[0].headshotPersonId, "1649999");
  assert.deepEqual(roster[0].headshotOverrideKeys, [`manual:${WIZARDS_TEAM_ID}:norris-agbakoko-row`]);
  assert.equal(roster[0].cap, 40);
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
