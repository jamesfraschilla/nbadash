import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialCallEvent,
  classifyOfficialAction,
  detectCoachChallengeActions,
  extractOfficialCallEvents,
  extractOfficialToken,
  matchOfficialToken,
} from "./officiatingParser.js";

const officials = [
  { personId: 1, firstName: "Scott", familyName: "Foster", jerseyNum: "48" },
  { personId: 2, firstName: "Tre", familyName: "Maddox", jerseyNum: "23" },
  { personId: 3, firstName: "Pat", familyName: "Fraher", jerseyNum: "26" },
];

test("extractOfficialToken ignores player foul-count parentheticals and returns the final official token", () => {
  assert.equal(extractOfficialToken("Mitchell S.FOUL (P1.T1) (S.Foster)"), "S.Foster");
  assert.equal(extractOfficialToken("CELTICS Violation: Delay Of Game (T.Maddox)"), "T.Maddox");
  assert.equal(extractOfficialToken("Brown Free Throw 1 of 2"), null);
  assert.equal(extractOfficialToken("Mitchell S.FOUL (P1.T1)"), null);
});

test("matchOfficialToken matches initial plus last name against the game crew", () => {
  const match = matchOfficialToken("T.Maddox", officials);
  assert.equal(match.official.personId, 2);
  assert.equal(match.reason, "initial-last");
  assert.ok(match.confidence > 0.9);
});

test("classifyOfficialAction derives broad categories without requiring a fixed category list", () => {
  assert.deepEqual(
    classifyOfficialAction({
      actionType: "violation",
      description: "A.Drummond Violation: Defensive Goaltending (T.Maddox)",
    }),
    { primaryCategory: "violation", secondaryCategory: "defensive_goaltending" }
  );

  assert.equal(
    classifyOfficialAction({
      actionType: "foul",
      subType: "personal",
      descriptor: "shooting",
      description: "T.Maxey S.FOUL (P2.T3) (P.Fraher)",
    }).primaryCategory,
    "foul"
  );
});

test("buildOfficialCallEvent preserves raw action fields and matched official metadata", () => {
  const event = buildOfficialCallEvent({
    actionNumber: 123,
    orderNumber: 1240000,
    actionType: "violation",
    description: "CELTICS Violation: Delay Of Game (T.Maddox)",
    period: 2,
    clock: "PT04M56.00S",
    teamTricode: "BOS",
  }, {
    officials,
    gameId: "0042500111",
    season: "2025-26",
    seasonType: "playoffs",
    homeTeam: "BOS",
    awayTeam: "PHI",
  });

  assert.equal(event.officialName, "Tre Maddox");
  assert.equal(event.primaryCategory, "violation");
  assert.equal(event.secondaryCategory, "delay_of_game");
  assert.equal(event.description, "CELTICS Violation: Delay Of Game (T.Maddox)");
  assert.equal(event.chargedTeam, "BOS");
  assert.equal(event.benefitingTeam, "PHI");
  assert.equal(event.sourcePayload.actionNumber, 123);
});

test("buildOfficialCallEvent uses cdnnba officialId without requiring a description token", () => {
  const event = buildOfficialCallEvent({
    actionNumber: 401,
    orderNumber: 4010000,
    actionType: "turnover",
    subType: "out-of-bounds",
    descriptor: "bad pass",
    description: "Harden Bad Pass Turnover Out of Bounds",
    period: 3,
    clock: "PT04M22.00S",
    teamTricode: "LAC",
    officialId: 2,
  }, {
    officials,
    gameId: "0022500111",
    season: "2025-26",
    seasonType: "Regular Season",
    homeTeam: "LAC",
    awayTeam: "WAS",
  });

  assert.equal(event.officialName, "Tre Maddox");
  assert.equal(event.officialId, "2");
  assert.equal(event.primaryCategory, "turnover");
  assert.equal(event.secondaryCategory, "bad_pass_out_of_bounds");
  assert.equal(event.confidenceReason, "exact-official-id");
  assert.equal(event.sourcePayload.officialId, 2);
});

test("buildOfficialCallEvent can preserve a cdnnba officialId using a context name map", () => {
  const event = buildOfficialCallEvent({
    actionNumber: 512,
    actionType: "violation",
    subType: "defensive goaltending",
    description: "A. Drummond Violation: Defensive Goaltending",
    period: 2,
    clock: "PT07M21.00S",
    teamTricode: "PHI",
    officialId: "1627523",
  }, {
    officials: [],
    officialNameById: new Map([["1627523", "Scott Foster"]]),
    gameId: "0022500112",
    season: "2025-26",
    seasonType: "Regular Season",
    homeTeam: "PHI",
    awayTeam: "BOS",
  });

  assert.equal(event.officialName, "Scott Foster");
  assert.equal(event.officialId, "1627523");
  assert.equal(event.primaryCategory, "violation");
  assert.equal(event.secondaryCategory, "defensive_goaltending");
  assert.equal(event.confidence, 0.92);
  assert.match(event.confidenceReason, /context-official-name/);
});

test("extractOfficialCallEvents returns every official-attributed play-by-play action", () => {
  const events = extractOfficialCallEvents({
    gameId: "0042500111",
    seasonYear: "2025-26",
    seasonType: "playoffs",
    homeTeam: { teamTricode: "BOS" },
    awayTeam: { teamTricode: "PHI" },
    officials,
    playByPlayActions: [
      { actionNumber: 1, actionType: "2pt", description: "Brown 7' Driving Floating Shot" },
      { actionNumber: 2, actionType: "violation", description: "CELTICS Violation: Delay Of Game (T.Maddox)" },
      { actionNumber: 3, actionType: "foul", description: "Hauser S.FOUL (P2.T3) (S.Foster)" },
      { actionNumber: 4, actionType: "turnover", subType: "traveling", description: "Traveling Turnover", officialId: 3 },
    ],
  });

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.officialName), ["Tre Maddox", "Scott Foster", "Pat Fraher"]);
});

test("detectCoachChallengeActions extracts challenge rows from play-by-play", () => {
  const challenges = detectCoachChallengeActions({
    gameId: "0042500131",
    seasonYear: "2025-26",
    seasonType: "playoffs",
    homeTeam: { teamTricode: "CLE" },
    awayTeam: { teamTricode: "TOR" },
    playByPlayActions: [
      { actionNumber: 195, actionType: "instantreplay", subType: "challenge", descriptor: "support", period: 2, clock: "PT11M24.00S", teamTricode: "CLE" },
      { actionNumber: 196, actionType: "timeout", subType: "challenge", period: 2, clock: "PT11M24.00S", teamTricode: "CLE" },
      { actionNumber: 618, actionType: "instantreplay", subType: "challenge", descriptor: "overturned", period: 4, clock: "PT06M24.00S", teamTricode: "TOR" },
      { actionNumber: 620, actionType: "timeout", subType: "challenge", period: 4, clock: "PT05M24.00S", teamTricode: "CLE" },
    ],
  });

  assert.equal(challenges.length, 3);
  assert.equal(challenges[0].challengingTeam, "CLE");
  assert.equal(challenges[0].challengeOutcome, "unsuccessful");
  assert.equal(challenges[1].challengeOutcome, "successful");
  assert.equal(challenges[2].matchReason, "detected-pbp-timeout-challenge");
  assert.equal(challenges[2].challengeOutcome, "");
});

test("detectCoachChallengeActions carries the timeout team onto a teamless replay result", () => {
  const challenges = detectCoachChallengeActions({
    gameId: "0012600052",
    homeTeam: { teamTricode: "MIL" },
    awayTeam: { teamTricode: "CHI" },
    playByPlayActions: [
      { actionNumber: 100, actionType: "timeout", subType: "challenge", period: 3, clock: "PT05M27.00S", teamTricode: "MIL" },
      { actionNumber: 101, actionType: "instantreplay", subType: "challenge", descriptor: "support", period: 3, clock: "PT05M27.00S", teamTricode: null },
    ],
  });

  assert.equal(challenges.length, 1);
  assert.equal(challenges[0].challengingTeam, "MIL");
  assert.equal(challenges[0].challengeOutcome, "unsuccessful");
  assert.equal(challenges[0].matchedActionNumber, 101);
});

test("detectCoachChallengeActions links an unambiguous same-clock challenged play instead of the replay marker", () => {
  const challenges = detectCoachChallengeActions({
    gameId: "0012600019",
    seasonYear: "2026-27",
    homeTeam: { teamTricode: "GSW" },
    awayTeam: { teamTricode: "POR" },
    playByPlayActions: [
      { actionNumber: 370, actionType: "2pt", period: 2, clock: "PT01M55.00S", description: "Curry 2PT Shot" },
      { actionNumber: 371, actionType: "turnover", subType: "outofbounds", period: 2, clock: "PT01M37.00S", teamTricode: "POR", description: "Lillard Out of Bounds - Bad Pass Turnover" },
      { actionNumber: 375, actionType: "timeout", subType: "challenge", period: 2, clock: "PT01M37.00S", teamTricode: "GSW" },
      { actionNumber: 376, actionType: "instantreplay", subType: "challenge", descriptor: "overturned", period: 2, clock: "PT01M37.00S", teamTricode: "GSW" },
    ],
  });

  assert.equal(challenges.length, 1);
  assert.equal(challenges[0].matchedActionNumber, 376);
  assert.match(challenges[0].videoUrl, /GameEventID=371/);
  assert.equal(challenges[0].sourcePayload.challengedAction.actionNumber, 371);
});

test("detectCoachChallengeActions does not guess a challenged play across different clocks", () => {
  const [challenge] = detectCoachChallengeActions({
    gameId: "0012609999",
    seasonYear: "2026-27",
    playByPlayActions: [
      { actionNumber: 10, actionType: "foul", period: 3, clock: "PT04M01.00S", description: "Personal foul" },
      { actionNumber: 11, actionType: "timeout", subType: "challenge", period: 3, clock: "PT04M00.00S", teamTricode: "WAS" },
      { actionNumber: 12, actionType: "instantreplay", subType: "challenge", period: 3, clock: "PT04M00.00S", teamTricode: "WAS" },
    ],
  });

  assert.equal(challenge.videoUrl, "");
  assert.equal(challenge.sourcePayload.challengedAction, null);
});

test("detectCoachChallengeActions supports the Stats API challenge-ruling schema", () => {
  const challenges = detectCoachChallengeActions({
    gameId: "0012600060",
    homeTeam: { teamTricode: "NOP" },
    awayTeam: { teamTricode: "WAS" },
    playByPlayActions: [
      { actionNumber: 76, actionType: "Instant Replay", subType: "Coach Challenge Overturn Ruling", period: 1, clock: "PT07M47.00S", teamTricode: "WAS" },
      { actionNumber: 259, actionType: "Instant Replay", subType: "Coach Challenge Support Ruling", period: 2, clock: "PT06M34.00S", teamTricode: "NOP" },
    ],
  });

  assert.deepEqual(challenges.map((challenge) => challenge.challengeOutcome), ["successful", "unsuccessful"]);
  assert.deepEqual(challenges.map((challenge) => challenge.challengingTeam), ["WAS", "NOP"]);
});
