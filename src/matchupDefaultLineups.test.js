import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchupDefaultLineup,
  buildMatchupDefaultLineupMap,
} from "./matchupDefaultLineups.js";

const roster = [
  { personId: "1", firstName: "Alex", familyName: "Sarr", fullName: "Alex Sarr" },
  { personId: "2", firstName: "Bub", familyName: "Carrington", fullName: "Bub Carrington" },
  { personId: "3", firstName: "A.J.", familyName: "Dybantsa", fullName: "A.J. Dybantsa" },
  { personId: "4", firstName: "Kyshawn", familyName: "George", fullName: "Kyshawn George Jr." },
  { personId: "5", firstName: "Anthony", familyName: "Davis", fullName: "Anthony Davis" },
];

test("buildMatchupDefaultLineup resolves ESPN names to roster person IDs", () => {
  const lineup = buildMatchupDefaultLineup({
    teamId: "1610612764",
    defaultTeam: {
      players: [
        { fullName: "Bub Carrington", position: "PG" },
        { fullName: "Kyshawn George", position: "SG" },
        { fullName: "AJ Dybantsa", position: "SF" },
        { fullName: "Anthony Davis", position: "PF" },
        { fullName: "Alex Sarr", position: "C" },
      ],
    },
    roster,
  });

  assert.deepEqual(lineup.playerIds, ["2", "4", "3", "5", "1"]);
  assert.deepEqual(lineup.unmatched, []);
});

test("buildMatchupDefaultLineup pads unmatched players without inventing selections", () => {
  const lineup = buildMatchupDefaultLineup({
    teamId: "1610612764",
    defaultTeam: {
      players: [
        { fullName: "Missing Player", position: "PG" },
        { fullName: "Alex Sarr", position: "C" },
      ],
    },
    roster,
  });

  assert.deepEqual(lineup.playerIds, ["1", "", "", "", ""]);
  assert.deepEqual(lineup.unmatched, ["Missing Player"]);
});

test("buildMatchupDefaultLineupMap keys defaults by league and team", () => {
  const map = buildMatchupDefaultLineupMap({
    teams: {
      "1610612764": {
        players: [{ fullName: "Alex Sarr", position: "C" }],
      },
    },
  }, {
    "1610612764": roster,
  });

  assert.equal(map["nba:1610612764"].playerIds[0], "1");
});
