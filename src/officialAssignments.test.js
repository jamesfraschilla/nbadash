import assert from "node:assert/strict";
import test from "node:test";
import { matchPublishedAssignmentForGame, mergeOfficialsWithPublishedAssignment, normalizeOfficialRole } from "./officialAssignments.js";

test("maps official NBA live-boxscore assignments to crew roles", () => {
  assert.equal(normalizeOfficialRole("OFFICIAL1"), "crewChief");
  assert.equal(normalizeOfficialRole("OFFICIAL2"), "referee");
  assert.equal(normalizeOfficialRole("OFFICIAL3"), "umpire");
});

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

test("stable referee IDs merge assignments even after a published name changes", () => {
  const merged = mergeOfficialsWithPublishedAssignment([{
    personId: "204058",
    name: "Former Name",
    jerseyNumber: "71",
  }], {
    crew: [{
      officialId: "204058",
      name: "Current Name",
      jerseyNumber: "72",
      role: "Crew Chief",
      roleKey: "crewChief",
    }],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].personId, "204058");
  assert.equal(merged[0].fullName, "Current Name");
  assert.equal(merged[0].jerseyNumber, "72");
  assert.equal(merged[0].roleKey, "crewChief");
  assert.equal(merged[0].assignmentOrder, 1);
});

test("published assignments discard unrelated officials from a transient oversized feed", () => {
  const assignment = {
    crew: [
      { name: "Curtis Blair", roleKey: "crewChief" },
      { name: "Evan Scott", roleKey: "referee" },
      { name: "Michael Smith", roleKey: "umpire" },
    ],
  };
  const merged = mergeOfficialsWithPublishedAssignment([
    { personId: "1", name: "Curtis Blair" },
    { personId: "2", name: "Evan Scott" },
    { personId: "3", name: "Michael Smith" },
    { personId: "4", name: "Eric Lewis" },
    { personId: "5", name: "Matt Myers" },
    { personId: "6", name: "Gediminas Petraitis" },
  ], assignment);

  assert.deepEqual(merged.map((official) => official.name), ["Curtis Blair", "Evan Scott", "Michael Smith"]);
});

test("a complete live crew preserves a legitimate replacement instead of restoring the published official", () => {
  const merged = mergeOfficialsWithPublishedAssignment([
    { personId: "1", name: "Official One", roleKey: "crewChief" },
    { personId: "2", name: "Official Two", roleKey: "referee" },
    { personId: "4", name: "Live Replacement", roleKey: "umpire" },
  ], {
    crew: [
      { name: "Official One", roleKey: "crewChief" },
      { name: "Official Two", roleKey: "referee" },
      { name: "Original Official", roleKey: "umpire" },
    ],
  });

  assert.deepEqual(merged.map((official) => official.name), ["Official One", "Official Two", "Live Replacement"]);
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
