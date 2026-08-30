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

test("enrichChallengeEventsWithOfficials uses a conservative second pass for foul challenges", () => {
  const [challenge] = enrichChallengeEventsWithOfficials([
    {
      game_id: "0022500101",
      game_clock: "03:42.0",
      challenging_team: "ATL",
      period: 1,
      challenge_type: "Foul",
      initial_call: "Defensive Foul",
      match_confidence: 0.98,
      match_reason: "matched-official-pdf-video-game-id",
      source_payload: {},
    },
  ], [
    {
      game_id: "0022500101",
      period: 1,
      game_clock: "03:35.0",
      action_number: 108,
      primary_category: "foul",
      description: "J.Johnson S.FOUL (T.Ford)",
      official_id: "1627938",
      official_name: "Tyler Ford",
      charged_team: "ATL",
    },
  ], []);

  assert.equal(challenge.whistling_official_name, "Tyler Ford");
  assert.equal(challenge.matched_action_number, 108);
  assert.equal(challenge.review_status, "auto");
  assert.match(challenge.match_reason, /matched-compatible-call-second-pass-window/);
});

test("enrichChallengeEventsWithOfficials does not second-pass OOB rows to a whistle", () => {
  const [challenge] = enrichChallengeEventsWithOfficials([
    {
      game_id: "0022500102",
      game_clock: "03:42.0",
      challenging_team: "ATL",
      period: 1,
      challenge_type: "OOB",
      initial_call: "Away Team Ball",
      source_payload: {},
    },
  ], [
    {
      game_id: "0022500102",
      period: 1,
      game_clock: "03:35.0",
      action_number: 109,
      primary_category: "turnover",
      description: "Out of Bounds - Bad Pass Turnover",
      official_id: "1627938",
      official_name: "Tyler Ford",
      charged_team: "ATL",
    },
  ], []);

  assert.equal(challenge.whistling_official_name, "");
  assert.equal(challenge.review_status, "needs_review");
});

test("enrichChallengeEventsWithOfficials matches OOB challenges to cdnnba turnover out-of-bounds rows", () => {
  const [challenge] = enrichChallengeEventsWithOfficials([
    {
      game_id: "0022500809",
      game_clock: "11:04.0",
      challenging_team: "LAL",
      period: 3,
      challenge_type: "OOB",
      initial_call: "Away Team Ball",
      source_payload: {},
    },
  ], [
    {
      id: "nearby-foul",
      game_id: "0022500809",
      period: 3,
      game_clock: "PT11M03.00S",
      action_number: 336,
      action_type: "foul",
      primary_category: "foul",
      secondary_category: "personal",
      description: "Nearby personal foul",
      official_id: "1",
      official_name: "Wrong Official",
      charged_team: "LAL",
    },
    {
      id: "oob-call",
      game_id: "0022500809",
      period: 3,
      game_clock: "PT11M04.00S",
      action_number: 337,
      action_type: "turnover",
      sub_type: "out-of-bounds",
      descriptor: "lost ball",
      primary_category: "turnover",
      secondary_category: "lost_ball_out_of_bounds",
      description: "Lost ball out-of-bounds TURNOVER",
      official_id: "8",
      official_name: "Marc Davis",
      charged_team: "LAL",
    },
  ], []);

  assert.equal(challenge.whistling_official_name, "Marc Davis");
  assert.equal(challenge.matched_action_number, 337);
  assert.equal(challenge.matched_call_event_id, "oob-call");
  assert.match(challenge.match_reason, /matched-compatible-call-at-clock/);
});

test("enrichChallengeEventsWithOfficials is idempotent for repeated matched rows", () => {
  const sourceChallenge = {
    game_id: "0022500809",
    game_clock: "11:04.0",
    challenging_team: "LAL",
    period: 3,
    challenge_type: "OOB",
    initial_call: "Away Team Ball",
    match_confidence: 0.98,
    match_reason: "matched-official-pdf-video-game-id",
    review_status: "needs_review",
    source_payload: {},
  };
  const calls = [{
    id: "oob-call",
    game_id: "0022500809",
    period: 3,
    game_clock: "PT11M04.00S",
    action_number: 337,
    action_type: "turnover",
    sub_type: "out-of-bounds",
    primary_category: "turnover",
    secondary_category: "lost_ball_out_of_bounds",
    description: "Lost ball out-of-bounds TURNOVER",
    official_id: "8",
    official_name: "Marc Davis",
    charged_team: "LAL",
  }];

  const [firstPass] = enrichChallengeEventsWithOfficials([sourceChallenge], calls, []);
  const [secondPass] = enrichChallengeEventsWithOfficials([firstPass], calls, []);

  assert.equal(firstPass.review_status, "auto");
  assert.equal(secondPass.match_confidence, firstPass.match_confidence);
  assert.equal(secondPass.match_reason, firstPass.match_reason);
  assert.equal(secondPass.review_status, firstPass.review_status);
});
