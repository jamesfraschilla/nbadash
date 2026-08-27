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
    ],
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.officialName), ["Tre Maddox", "Scott Foster"]);
});

test("detectCoachChallengeActions extracts replay challenge rows from play-by-play", () => {
  const challenges = detectCoachChallengeActions({
    gameId: "0042500131",
    seasonYear: "2025-26",
    seasonType: "playoffs",
    homeTeam: { teamTricode: "CLE" },
    awayTeam: { teamTricode: "TOR" },
    playByPlayActions: [
      { actionNumber: 195, actionType: "instantreplay", subType: "challenge", descriptor: "support", period: 2, clock: "PT11M24.00S", teamTricode: "CLE" },
      { actionNumber: 618, actionType: "instantreplay", subType: "challenge", descriptor: "overturned", period: 4, clock: "PT06M24.00S", teamTricode: "TOR" },
    ],
  });

  assert.equal(challenges.length, 2);
  assert.equal(challenges[0].challengingTeam, "CLE");
  assert.equal(challenges[0].challengeOutcome, "unsuccessful");
  assert.equal(challenges[1].challengeOutcome, "successful");
});
