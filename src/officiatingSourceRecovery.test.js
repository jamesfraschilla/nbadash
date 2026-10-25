import test from "node:test";
import assert from "node:assert/strict";
import { recoverOfficialReviewMarkers } from "./officiatingSourceRecovery.js";
import { detectCoachChallengeActions } from "./officiatingParser.js";

test("an official NBA page review supplies outcome and the timeout team, not the jump-ball team", () => {
  const home = { teamId: 1610612747, teamTricode: "LAL" };
  const away = { teamId: 1610612744, teamTricode: "GSW" };
  const game = { gameId: "0022600005", homeTeam: home, awayTeam: away, playByPlayActions: [
    { actionNumber: 737, orderNumber: 100, period: 4, clock: "PT01M59.00S", actionType: "timeout", teamId: away.teamId, teamTricode: "GSW" },
    { actionNumber: 740, orderNumber: 200, period: 4, clock: "PT01M59.00S", actionType: "jumpball", subType: "Coach Challenge", teamId: home.teamId, teamTricode: "LAL" },
  ] };
  const page = [
    { actionNumber: 737, period: 4, clock: "PT01M59.00S", actionType: "Timeout", teamId: 0, personId: away.teamId },
    { actionNumber: 738, period: 4, clock: "PT01M59.00S", actionType: "Instant Replay", subType: "Coach Challenge Overturn Ruling" },
    { actionNumber: 740, period: 4, clock: "PT01M59.00S", actionType: "Jump Ball", subType: "Coach Challenge", teamId: home.teamId },
  ];
  const actions = recoverOfficialReviewMarkers(game, page);
  const challenges = detectCoachChallengeActions({ ...game, playByPlayActions: actions });
  assert.equal(challenges.length, 1);
  assert.equal(challenges[0].challengingTeam, "GSW");
  assert.equal(challenges[0].challengeOutcome, "successful");
  assert.equal(actions.find((a) => a.actionNumber === 738).orderNumber, 150);
});

test("a timeout without a decision remains unresolved rather than becoming a loss", () => {
  const game = { homeTeam: { teamId: 1, teamTricode: "LAL" }, awayTeam: { teamId: 2, teamTricode: "GSW" },
    playByPlayActions: [{ actionNumber: 430, period: 3, clock: "PT08M03.00S", actionType: "timeout", subType: "challenge", teamTricode: "LAL", teamId: 1 }] };
  assert.equal(detectCoachChallengeActions({ ...game, playByPlayActions: recoverOfficialReviewMarkers(game, []) })[0].challengeOutcome, "");
});

test("an unmapped review team is rejected, and non-coach replays are ignored", () => {
  const game = { gameId: "a", homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 }, playByPlayActions: [] };
  assert.deepEqual(recoverOfficialReviewMarkers(game, [{ actionType: "Instant Replay", subType: "Replay Center" }]), []);
  assert.throws(() => recoverOfficialReviewMarkers(game, [{ actionType: "Instant Replay", subType: "Coach Challenge Overturn Ruling", period: 1, clock: "1:00" }]), /no verified challenging timeout team/);
});
