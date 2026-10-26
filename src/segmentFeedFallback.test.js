import test from "node:test";
import assert from "node:assert/strict";
import { needsThreeQuarterFallback, rebuildThreeQuarterFeed } from "./segmentFeedFallback.js";

const game = { gameId: "0022600118", gameStatus: 3, period: 4,
  homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 },
  playByPlayActions: [
    { actionNumber: 1, orderNumber: 1, period: 1, teamId: 1, personId: 10, actionType: "2pt", shotResult: "Made", scoreHome: 2, scoreAway: 0 },
    { actionNumber: 2, orderNumber: 2, period: 2, teamId: 2, personId: 20, actionType: "3pt", shotResult: "Made", scoreHome: 2, scoreAway: 3 },
    { actionNumber: 3, orderNumber: 3, period: 4, teamId: 1, personId: 10, actionType: "2pt", shotResult: "Made", scoreHome: 4, scoreAway: 3 },
  ],
  boxScore: { home: { players: [{ personId: 10, firstName: "Home", familyName: "Player", points: 4 }], totals: { points: 4 } },
    away: { players: [{ personId: 20, firstName: "Away", familyName: "Player", points: 3 }], totals: { points: 3 } } } };

test("empty Q1–Q3 response is repaired without borrowing Q4 or full-game ratings", () => {
  const missing = { ...game, teamStats: { home: { offensiveRating: 999 } }, boxScore: {
    home: { players: [], totals: { points: 0 } }, away: { players: [], totals: { points: 0 } } } };
  assert.equal(needsThreeQuarterFallback(missing, "Q1-Q3"), true);
  assert.equal(needsThreeQuarterFallback(missing, "Q2"), false);
  const repaired = rebuildThreeQuarterFeed(missing, game);
  assert.equal(repaired.boxScore.home.totals.points, 2);
  assert.equal(repaired.boxScore.away.totals.points, 3);
  assert.equal(repaired.boxScore.home.players[0].points, 2);
  assert.equal(repaired.boxScore.home.players[0].familyName, "Player");
  assert.equal(repaired.teamStats.home.offensiveRating, undefined);
  assert.equal(game.boxScore.home.players[0].points, 4);
});

test("healthy endpoints are retained and failed repairs never invent zero stats", () => {
  assert.equal(needsThreeQuarterFallback(game, "Q1-Q3"), false);
  assert.throws(() => rebuildThreeQuarterFeed(game, { ...game, gameId: "other" }), /identity/);
  assert.throws(() => rebuildThreeQuarterFeed(game, { ...game, playByPlayActions: [] }), /unavailable/);
});
