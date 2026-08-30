import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialProfiles, buildTeamProfiles, preferAuthoritativeChallengeEvents, specificCallCategory } from "./officiatingData.js";

test("preferAuthoritativeChallengeEvents keeps daily PBP rows until weekly official rows arrive", () => {
  const events = preferAuthoritativeChallengeEvents([
    {
      game_id: "0022500109",
      game_date: "2025-10-26",
      challenging_team: "WAS",
      period: 1,
      game_clock: "PT05M43.00S",
      challenge_outcome: "",
      source: "play_by_play",
    },
    {
      game_id: "0022500109",
      game_date: "2025-10-26",
      challenging_team: "WAS",
      period: 1,
      game_clock: "05:43.0",
      challenge_outcome: "successful",
      source: "nba_official_challenge_pdf",
    },
    {
      game_id: "0022500123",
      game_date: "2025-10-28",
      challenging_team: "WAS",
      period: 2,
      game_clock: "PT05M55.00S",
      challenge_outcome: "successful",
      source: "play_by_play",
    },
  ]);

  assert.equal(events.length, 2);
  assert.equal(events.find((event) => event.game_id === "0022500109").source, "nba_official_challenge_pdf");
  assert.equal(events.find((event) => event.game_id === "0022500123").source, "play_by_play");
});

test("specificCallCategory displays detailed foul and violation types", () => {
  assert.equal(specificCallCategory({
    primary_category: "foul",
    descriptor: "shooting",
    sub_type: "personal",
    description: "J.Tatum S.FOUL (S.Foster)",
  }), "Shooting Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    descriptor: "loose_ball",
    sub_type: "personal",
    description: "J.Tatum L.B.FOUL (S.Foster)",
  }), "Loose Ball Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    descriptor: "personal",
    description: "J.Tatum P.FOUL (S.Foster)",
  }), "Foul on Floor");

  assert.equal(specificCallCategory({
    primary_category: "violation",
    secondary_category: "delay_of_game",
    description: "CELTICS Violation: Delay Of Game (T.Maddox)",
  }), "Delay Of Game");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "3_second_violation",
    sub_type: "3-second-violation",
    description: "D. Lively II 3-second-violation TURNOVER (2 TO)",
  }), "Offensive 3 Second Violation");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "defensive_3_second_technical",
    descriptor: "defensive-3-second",
    sub_type: "technical",
    description: "A. Sarr defensive-3-second technical FOUL (1 Tech)",
  }), "Defensive 3 Second Violation");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "lost_ball",
    sub_type: "lost ball",
    description: "J. Butler III lost ball TURNOVER (1 TO)",
  }), "Lost Ball Turnover");
});

test("official challenge logs prefer whistle label while counting dual crew-chief role", () => {
  const [profile] = buildOfficialProfiles([], [
    {
      id: "challenge-1",
      game_id: "0022500001",
      game_date: "2026-01-01",
      away_team: "WAS",
      home_team: "BOS",
      period: 2,
      game_clock: "04:22.0",
      challenge_type: "Foul",
      challenge_outcome: "unsuccessful",
      crew_chief_id: "25",
      crew_chief_name: "Scott Foster",
      whistling_official_id: "25",
      whistling_official_name: "Scott Foster",
    },
  ], [{
    game_id: "0022500001",
    game_date: "2026-01-01",
    official_id: "25",
    official_name: "Scott Foster",
    role_key: "crewChief",
  }]);

  assert.equal(profile.name, "Scott Foster");
  assert.equal(profile.whistleChallenges, 1);
  assert.equal(profile.crewChiefChallenges, 1);
  assert.equal(profile.successfulWhistleChallenges, 0);
  assert.equal(profile.successfulCrewChiefChallenges, 0);
  assert.equal(profile.challengeLog.length, 1);
  assert.equal(profile.challengeLog[0].profileChallengeRole, "whistle");
});

test("team calls by official uses games the official worked for that team", () => {
  const [profile] = buildTeamProfiles([
    {
      game_id: "game-1",
      game_date: "2026-01-01",
      away_team: "WAS",
      home_team: "BOS",
      charged_team: "BOS",
      benefiting_team: "WAS",
      official_name: "Tyler Ford",
      primary_category: "foul",
      descriptor: "shooting",
    },
    {
      game_id: "game-2",
      game_date: "2026-01-03",
      away_team: "WAS",
      home_team: "NYK",
      charged_team: "NYK",
      benefiting_team: "WAS",
      official_name: "Tyler Ford",
      primary_category: "foul",
      descriptor: "personal",
    },
    {
      game_id: "game-3",
      game_date: "2026-01-05",
      away_team: "WAS",
      home_team: "PHI",
      charged_team: "PHI",
      benefiting_team: "WAS",
      official_name: "Other Official",
      primary_category: "violation",
      secondary_category: "traveling",
    },
  ], []).filter((row) => row.team === "WAS");

  assert.equal(profile.games, 3);
  assert.equal(profile.netCallsFor, 1);
  assert.equal(profile.callsByOfficial["Tyler Ford"], 1);
  assert.equal(profile.callsByOfficial["Other Official"], 1);
});
