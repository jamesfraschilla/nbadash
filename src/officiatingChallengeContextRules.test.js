import assert from "node:assert/strict";
import test from "node:test";
import {
  proximateAutoTagChallengeIds,
  successfulOobChallengeAssessedFoul,
} from "./officiatingChallengeContextRules.js";

test("successfulOobChallengeAssessedFoul detects successful OOB challenges with same-clock foul assessment", () => {
  const challenge = {
    id: "challenge-1",
    game_id: "0022500001",
    period: 4,
    game_clock: "06:17.0",
    challenge_type: "OOB",
    initial_call: "Away Team Ball",
    challenge_outcome: "successful",
  };
  const calls = [{
    game_id: "0022500001",
    period: 4,
    game_clock: "PT06M17.00S",
    primary_category: "foul",
    description: "Player personal FOUL",
  }];

  assert.equal(successfulOobChallengeAssessedFoul(challenge, calls), true);
});

test("successfulOobChallengeAssessedFoul ignores normal OOB reversals and unsuccessful challenges", () => {
  const calls = [{
    game_id: "0022500001",
    period: 4,
    game_clock: "PT06M17.00S",
    primary_category: "turnover",
    description: "lost ball out-of-bounds TURNOVER",
  }];

  assert.equal(successfulOobChallengeAssessedFoul({
    id: "challenge-1",
    game_id: "0022500001",
    period: 4,
    game_clock: "06:17.0",
    challenge_type: "OOB",
    initial_call: "Away Team Ball",
    challenge_outcome: "successful",
  }, calls), false);

  assert.equal(successfulOobChallengeAssessedFoul({
    id: "challenge-2",
    game_id: "0022500001",
    period: 4,
    game_clock: "06:17.0",
    challenge_type: "OOB",
    initial_call: "Away Team Ball",
    challenge_outcome: "unsuccessful",
  }, [{
    game_id: "0022500001",
    period: 4,
    game_clock: "PT06M17.00S",
    primary_category: "foul",
  }]), false);
});

test("proximateAutoTagChallengeIds returns only eligible challenge ids", () => {
  const ids = proximateAutoTagChallengeIds([
    {
      id: "eligible",
      game_id: "0022500001",
      period: 4,
      game_clock: "06:17.0",
      challenge_type: "OOB",
      challenge_outcome: "successful",
    },
    {
      id: "not-oob",
      game_id: "0022500001",
      period: 4,
      game_clock: "06:17.0",
      challenge_type: "Foul",
      challenge_outcome: "successful",
    },
  ], [{
    game_id: "0022500001",
    period: 4,
    game_clock: "PT06M18.00S",
    primary_category: "foul",
  }]);

  assert.deepEqual(ids, ["eligible"]);
});
