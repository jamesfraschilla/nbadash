import assert from "node:assert/strict";
import test from "node:test";
import { matchPublishedAssignmentForGame, mergeOfficialsWithPublishedAssignment } from "./officialAssignments.js";

test("matches the official NBA assignment to a scheduled game", () => {
  const result = matchPublishedAssignmentForGame([{
    game: "Washington @ New York",
    crewChief: "Marc Davis",
    crewChiefNumber: "8",
    referee: "Ray Acosta",
    refereeNumber: "54",
    umpire: "Suyash Mehta",
    umpireNumber: "47",
    alternate: "",
  }], {
    awayTeam: { teamCity: "Washington", teamName: "Wizards", teamTricode: "WAS" },
    homeTeam: { teamCity: "New York", teamName: "Knicks", teamTricode: "NYK" },
  });

  assert.deepEqual(result?.crew, [
    { name: "Marc Davis", jerseyNumber: "8", role: "Crew Chief", roleKey: "crewChief" },
    { name: "Ray Acosta", jerseyNumber: "54", role: "Referee", roleKey: "referee" },
    { name: "Suyash Mehta", jerseyNumber: "47", role: "Umpire", roleKey: "umpire" },
  ]);
});

test("published assignments populate missing preseason officials and current numbers", () => {
  const assignment = {
    crew: [
      { name: "Ben Taylor", jerseyNumber: "46", role: "Crew Chief", roleKey: "crewChief" },
      { name: "Matt Kallio", jerseyNumber: "53", role: "Referee", roleKey: "referee" },
      { name: "JP Primm", jerseyNumber: "82", role: "Umpire", roleKey: "umpire" },
    ],
  };
  const merged = mergeOfficialsWithPublishedAssignment([], assignment);
  assert.deepEqual(merged.map(({ name, jerseyNumber, roleKey }) => ({ name, jerseyNumber, roleKey })), [
    { name: "Ben Taylor", jerseyNumber: "46", roleKey: "crewChief" },
    { name: "Matt Kallio", jerseyNumber: "53", roleKey: "referee" },
    { name: "JP Primm", jerseyNumber: "82", roleKey: "umpire" },
  ]);
});

test("does not use another game's assignment", () => {
  const result = matchPublishedAssignmentForGame([{
    game: "Boston @ Cleveland",
    crewChief: "Official One",
    referee: "Official Two",
    umpire: "Official Three",
  }], {
    awayTeam: { teamCity: "Washington", teamName: "Wizards", teamTricode: "WAS" },
    homeTeam: { teamCity: "New York", teamName: "Knicks", teamTricode: "NYK" },
  });

  assert.equal(result, null);
});
