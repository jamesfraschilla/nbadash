import test from "node:test";
import assert from "node:assert/strict";
import { LIVE_AUDIT_GAMES, isLiveAuditGame } from "./liveAuditGames.js";
import { auditConfiguration, readySegments, segmentRange, reconcileGame } from "../scripts/live-game-audit.mjs";

test("only the approved three games receive prepared recaps", () => {
  assert.equal(LIVE_AUDIT_GAMES.length, 3);
  for (const game of LIVE_AUDIT_GAMES) assert.equal(isLiveAuditGame(game.gameId), true);
  assert.equal(isLiveAuditGame("0022600108"), false);
  assert.throws(() => auditConfiguration("0022600108"), /approved/);
});

test("automatic collection expires after the one-night window", () => {
  assert.equal(auditConfiguration("0022600112", Date.parse("2026-10-25T20:45:00Z")).gameId, "0022600112");
  assert.throws(() => auditConfiguration("0022600112", Date.parse("2026-10-25T16:00:00Z")), /Outside/);
  assert.throws(() => auditConfiguration("0022600112", Date.parse("2026-10-26T02:00:00Z")), /Outside/);
  assert.throws(() => auditConfiguration("0022600112", Date.parse("2027-10-25T21:00:00Z")), /Outside/);
  assert.equal(auditConfiguration("0022600112", Date.parse("2027-10-25T21:00:00Z"), true).gameId, "0022600112");
});

test("period-zero and an unconfirmed 0:00 clock do not generate recaps", () => {
  assert.deepEqual(readySegments({ gameStatus: 1, period: 0 }), []);
  assert.deepEqual(readySegments({ gameStatus: 2, period: 1, gameClock: "PT00M00.00S", playByPlayActions: [] }), []);
});

test("confirmed halftime generates Q1, Q2 and first half with the Washington ranges", () => {
  const segments = readySegments({ gameStatus: 2, period: 2, gameClock: "PT00M00.00S",
    playByPlayActions: [{ period: 2, actionType: "period", subType: "end" }] });
  assert.deepEqual(segments.map((s) => s.key), ["q1", "q2", "first-half"]);
  assert.deepEqual(segmentRange(segments.find((s) => s.key === "first-half")),
    { minPeriod: 1, minClock: "12:00", maxPeriod: 2, maxClock: "0:00" });
});

test("regulation ending does not prematurely generate a final recap before overtime", () => {
  const game = { gameStatus: 2, period: 4, gameClock: "PT00M00.00S",
    playByPlayActions: [{ period: 4, actionType: "period", subType: "end" }] };
  assert.equal(readySegments(game).some((s) => s.key === "all" || s.key === "second-half"), false);
  const final = readySegments({ ...game, gameStatus: 3, period: 5 });
  assert.equal(final.length, 8);
  assert.equal(segmentRange(final.find((s) => s.key === "all")).maxPeriod, 5);
  assert.equal(segmentRange(final.find((s) => s.key === "q4")).maxPeriod, 4);
});

test("capture reconciliation flags a disagreement without changing the input", () => {
  const game = { gameId: "0022600112", gameStatus: 1, period: 0, homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 },
    boxScore: { home: { players: [], totals: { points: 9 } }, away: { players: [], totals: { points: 0 } } }, playByPlayActions: [] };
  const before = JSON.stringify(game);
  const result = reconcileGame(game, null);
  assert.equal(result.failures.some((f) => f.field === "points" && f.box === 9 && f.playByPlay === 0), true);
  assert.equal(JSON.stringify(game), before);
});
