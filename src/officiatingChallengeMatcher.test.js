import assert from "node:assert/strict";
import test from "node:test";
import { enrichChallengeEventsWithOfficials } from "./officiatingChallengeMatcher.js";

test("enrichChallengeEventsWithOfficials attaches crew chief and whistling official from matched call", () => {
  const [challenge] = enrichChallengeEventsWithOfficials([
    {
      game_id: "0022500629",
      game_clock: "01:50.0",
      challenging_team: "WAS",
      period: 4,
      challenge_type: "Foul",
      initial_call: "Defensive Foul",
      match_confidence: 0.98,
      match_reason: "matched-official-pdf-video-game-id",
      source_payload: { pdfRow: { date: "1/22/2026" } },
    },
  ], [
    {
      game_id: "0022500629",
      period: 4,
      game_clock: "PT01M50.00S",
      action_number: 638,
      primary_category: "foul",
      description: "Middleton S.FOUL (P4.T4) (S.Mehta)",
      official_id: "1628953",
      official_name: "Suyash Mehta",
      charged_team: "WAS",
    },
  ], [
    {
      game_id: "0022500629",
      official_id: "1627523",
      official_name: "Kevin Cutler",
      role_key: "crewChief",
      assignment_order: 1,
    },
  ]);

  assert.equal(challenge.crew_chief_name, "Kevin Cutler");
  assert.equal(challenge.whistling_official_name, "Suyash Mehta");
  assert.equal(challenge.matched_action_number, 638);
  assert.equal(challenge.review_status, "auto");
  assert.match(challenge.match_reason, /matched-compatible-call-at-clock/);
  assert.equal(challenge.source_payload.officialMatcher.matchedCall.actionNumber, 638);
});

test("enrichChallengeEventsWithOfficials keeps unmatched official PDF rows reviewable", () => {
  const [challenge] = enrichChallengeEventsWithOfficials([
    {
      game_id: "0022501216",
      game_clock: "10:04.0",
      challenging_team: "WAS",
      period: 3,
      challenge_type: "OOB",
      initial_call: "Home Team Ball",
      source_payload: {},
    },
  ], [], [
    {
      game_id: "0022501216",
      official_id: "1146",
      official_name: "Tony Brothers",
      role_key: "crewChief",
      assignment_order: 1,
    },
  ]);

  assert.equal(challenge.crew_chief_name, "Tony Brothers");
  assert.equal(challenge.whistling_official_name, "");
  assert.equal(challenge.review_status, "needs_review");
  assert.match(challenge.match_reason, /no-compatible-call-at-clock/);
});
