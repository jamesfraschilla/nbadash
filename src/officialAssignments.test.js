import assert from "node:assert/strict";
import test from "node:test";
import { matchPublishedAssignmentForGame } from "./officialAssignments.js";

test("matches the official NBA assignment to a scheduled game", () => {
  const result = matchPublishedAssignmentForGame([{
    game: "Washington @ New York",
    crewChief: "Marc Davis",
    referee: "Ray Acosta",
    umpire: "Suyash Mehta",
    alternate: "",
  }], {
    awayTeam: { teamCity: "Washington", teamName: "Wizards", teamTricode: "WAS" },
    homeTeam: { teamCity: "New York", teamName: "Knicks", teamTricode: "NYK" },
  });

  assert.deepEqual(result?.crew, [
    { name: "Marc Davis", role: "Crew Chief" },
    { name: "Ray Acosta", role: "Referee" },
    { name: "Suyash Mehta", role: "Umpire" },
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
