import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialProfiles, buildTeamProfiles, preferAuthoritativeChallengeEvents, specificCallCategory } from "./officiatingData.js";
import { challengeFoulSubtype } from "./officiatingCategoryNormalization.js";

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
    descriptor: "shooting",
    sub_type: "personal",
    area: "Restricted Area",
    description: "J.Tatum S.FOUL (S.Foster)",
  }), "Restricted Area Shooting Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    descriptor: "shooting",
    sub_type: "personal",
    source_payload: { area: "Above the Break 3" },
    description: "J.Tatum 3PT S.FOUL (S.Foster)",
  }), "3-Pt Shooting Foul");

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
    primary_category: "foul",
    secondary_category: "double_technical",
    descriptor: "double",
    sub_type: "technical",
    description: "A. Gordon double technical FOUL (1 Tech)",
  }), "Technical Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "delay_technical",
    descriptor: "delay",
    sub_type: "technical",
    description: "TEAM foul technical",
  }), "Delay Of Game");

  assert.notEqual(specificCallCategory({
    primary_category: "foul",
    secondary_category: "flopping_technical",
    descriptor: "flopping",
    sub_type: "technical",
    description: "R. Holland II flopping technical FOUL (1 Tech)",
  }), "Technical Foul");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "lost_ball",
    sub_type: "lost ball",
    description: "J. Butler III lost ball TURNOVER (1 TO)",
  }), "Out Of Bounds");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "bad_pass",
    sub_type: "bad pass",
    description: "A. Reaves bad pass TURNOVER (3 TO)",
  }), "Out Of Bounds");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "looseball_personal",
    descriptor: "looseball",
    sub_type: "personal",
    description: "Williams L.B.FOUL (P1.T4) (B.Barnaky)",
  }), "Loose Ball Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "clearpath_personal",
    descriptor: "clearpath",
    sub_type: "personal",
    description: "Wade C.P.FOUL (P1.T2) (K.Mulla)",
  }), "Clear Path Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "double_personal",
    descriptor: "double",
    sub_type: "personal",
    description: "D. Clingan double personal FOUL (4 PF)",
  }), "Double Personal Foul");

  assert.equal(specificCallCategory({
    primary_category: "foul",
    secondary_category: "rim_hanging_technical",
    descriptor: "rim-hanging",
    sub_type: "technical",
    description: "B. Carrington rim-hanging technical FOUL (1 Tech)",
  }), "Rim Hanging Technical");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "discontinued_dribble",
    sub_type: "discontinued dribble",
    description: "J. Johnson discontinued dribble TURNOVER (4 TO)",
  }), "Palming");

  assert.equal(specificCallCategory({
    primary_category: "turnover",
    secondary_category: "10_second_freethrow_shooter",
    sub_type: "10-second-freethrow-shooter",
    description: "G. Antetokounmpo 10-second-freethrow-shooter TURNOVER (2 TO)",
  }), "10 Second Free Throw Violation");

  assert.equal(specificCallCategory({
    primary_category: "jump_ball",
    secondary_category: "",
    sub_type: "jump ball",
    description: "Jumpball violation",
  }), "Jump Ball");

  assert.equal(challengeFoulSubtype({
    primary_category: "foul",
    descriptor: "shooting",
    area: "Restricted Area",
  }), "Restricted Area");

  assert.equal(challengeFoulSubtype({
    primary_category: "foul",
    descriptor: "offensive",
    area: "Left Corner 3",
  }), "3-Pt");
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

test("official profiles count crew challenges for every assigned crew member", () => {
  const profiles = buildOfficialProfiles([], [
    {
      id: "challenge-1",
      game_id: "0022500001",
      game_date: "2026-01-01",
      away_team: "WAS",
      home_team: "BOS",
      period: 2,
      game_clock: "04:22.0",
      challenge_type: "Foul",
      challenge_outcome: "successful",
      crew_chief_id: "25",
      crew_chief_name: "Scott Foster",
      whistling_official_id: "39",
      whistling_official_name: "Tyler Ford",
    },
  ], [
    {
      game_id: "0022500001",
      game_date: "2026-01-01",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      role_key: "crewChief",
      assignment_order: 1,
    },
    {
      game_id: "0022500001",
      game_date: "2026-01-01",
      season_type: "Regular Season",
      official_id: "39",
      official_name: "Tyler Ford",
      role_key: "",
      assignment_order: 2,
    },
    {
      game_id: "0022500001",
      game_date: "2026-01-01",
      season_type: "Regular Season",
      official_id: "61",
      official_name: "Courtney Kirkland",
      role_key: "",
      assignment_order: 3,
    },
  ]);

  const foster = profiles.find((profile) => profile.name === "Scott Foster");
  const ford = profiles.find((profile) => profile.name === "Tyler Ford");
  const kirkland = profiles.find((profile) => profile.name === "Courtney Kirkland");
  assert.equal(foster.crewChallenges, 1);
  assert.equal(foster.crewChiefChallenges, 1);
  assert.equal(foster.challengeLog[0].profileChallengeRole, "crewChief");
  assert.equal(ford.crewChallenges, 1);
  assert.equal(ford.whistleChallenges, 1);
  assert.equal(ford.challengeLog[0].profileChallengeRole, "whistle");
  assert.equal(kirkland.crewChallenges, 1);
  assert.equal(kirkland.crewChiefChallenges, 0);
  assert.equal(kirkland.whistleChallenges, 0);
  assert.equal(kirkland.challengeLog[0].profileChallengeRole, "crew");
});

test("official technical counts include standard and double technicals only", () => {
  const [profile] = buildOfficialProfiles([
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "technical",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "double_technical",
      descriptor: "double",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "defensive_3_second_technical",
      descriptor: "defensive-3-second",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "delay_technical",
      descriptor: "delay",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "flopping_technical",
      descriptor: "flopping",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "technical",
      secondary_category: "flopping_technical",
      descriptor: "flopping",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "non_unsportsmanlike_technical",
      descriptor: "non-unsportsmanlike",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "rim_hanging_technical",
      descriptor: "rim-hanging",
      sub_type: "technical",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
      secondary_category: "excess_timeout_technical",
      descriptor: "excess timeout",
      sub_type: "technical",
    },
  ], [], []);

  assert.equal(profile.technicals, 2);
  assert.equal(profile.callsByCategory["Technical Foul"].value, 2);
  assert.equal(profile.callsByCategory["Defensive 3 Second Violation"].value, 1);
  assert.equal(profile.callsByCategory["Delay Of Game"].value, 2);
  assert.equal(profile.callsByCategory["Flopping Technical"].value, 2);
});

test("official profiles exclude preseason calls, assignments, and challenges from cumulative stats", () => {
  const [profile] = buildOfficialProfiles([
    {
      game_id: "0012500001",
      season_type: "Preseason",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
      primary_category: "foul",
    },
  ], [
    {
      id: "preseason-challenge",
      game_id: "0012500001",
      season_type: "Preseason",
      challenge_outcome: "successful",
      crew_chief_id: "25",
      crew_chief_name: "Scott Foster",
    },
    {
      id: "regular-challenge",
      game_id: "0022500001",
      season_type: "Regular Season",
      challenge_outcome: "unsuccessful",
      crew_chief_id: "25",
      crew_chief_name: "Scott Foster",
    },
  ], [
    {
      game_id: "0012500001",
      season_type: "Preseason",
      official_id: "25",
      official_name: "Scott Foster",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      official_id: "25",
      official_name: "Scott Foster",
    },
  ]);

  assert.equal(profile.games, 1);
  assert.equal(profile.calls, 1);
  assert.equal(profile.crewChiefChallenges, 1);
  assert.equal(profile.successfulCrewChiefChallenges, 0);
  assert.equal(profile.challengeLog.length, 1);
  assert.equal(profile.challengeLog[0].id, "regular-challenge");
});

test("team profiles exclude preseason calls and challenges from cumulative stats", () => {
  const [profile] = buildTeamProfiles([
    {
      game_id: "0012500001",
      season_type: "Preseason",
      away_team: "WAS",
      home_team: "BOS",
      charged_team: "BOS",
      benefiting_team: "WAS",
      official_name: "Scott Foster",
      primary_category: "foul",
    },
    {
      game_id: "0022500001",
      season_type: "Regular Season",
      away_team: "WAS",
      home_team: "BOS",
      charged_team: "WAS",
      benefiting_team: "BOS",
      official_name: "Scott Foster",
      primary_category: "foul",
    },
  ], [
    {
      id: "preseason-challenge",
      game_id: "0012500001",
      season_type: "Preseason",
      challenging_team: "WAS",
      challenge_outcome: "successful",
    },
    {
      id: "regular-challenge",
      game_id: "0022500001",
      season_type: "Regular Season",
      challenging_team: "WAS",
      challenge_outcome: "unsuccessful",
    },
  ]).filter((row) => row.team === "WAS");

  assert.equal(profile.games, 1);
  assert.equal(profile.netCallsFor, -1);
  assert.equal(profile.challenges, 1);
  assert.equal(profile.successfulChallenges, 0);
  assert.equal(profile.challengeLog.length, 1);
  assert.equal(profile.challengeLog[0].id, "regular-challenge");
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
