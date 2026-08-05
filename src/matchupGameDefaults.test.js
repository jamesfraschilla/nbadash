import assert from "node:assert/strict";
import test from "node:test";
import { findWashingtonOpponentTeamId } from "./matchupGameDefaults.js";

test("findWashingtonOpponentTeamId finds opponent when Washington is away", () => {
  const opponent = findWashingtonOpponentTeamId([
    {
      awayTeam: { teamId: "1610612764", teamTricode: "WAS" },
      homeTeam: { teamId: "1610612738", teamTricode: "BOS" },
    },
  ]);

  assert.equal(opponent, "1610612738");
});

test("findWashingtonOpponentTeamId finds opponent when Washington is home", () => {
  const opponent = findWashingtonOpponentTeamId([
    {
      awayTeam: { teamId: "1610612748", teamTricode: "MIA" },
      homeTeam: { teamId: "1610612764", teamTricode: "WAS" },
    },
  ]);

  assert.equal(opponent, "1610612748");
});

test("findWashingtonOpponentTeamId ignores non-NBA opponents when allowed IDs are provided", () => {
  const opponent = findWashingtonOpponentTeamId([
    {
      awayTeam: { teamId: "1610612764", teamTricode: "WAS" },
      homeTeam: { teamId: "1612709928", teamTricode: "CCG" },
    },
  ], new Set(["1610612738"]));

  assert.equal(opponent, "");
});

