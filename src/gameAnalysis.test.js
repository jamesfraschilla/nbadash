import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnalysisSegmentShortcut,
  buildCompletedAnalysisSegments,
  buildAnalysisMinuteOptions,
  buildInitialAnalysisForm,
  formatAnalysisPoint,
  validateAnalysisForm,
} from "./gameAnalysis.js";

const summerGame = {
  gameId: "1322600001",
  gameStatus: 2,
  period: 4,
  gameClock: "PT03M26.00S",
  playByPlayActions: [
    {
      actionNumber: 2,
      actionType: "period",
      subType: "start",
      period: 1,
      clock: "PT10M00.00S",
      orderNumber: 20000,
    },
  ],
};

test("analysis minute options use 10-minute periods for Summer League games", () => {
  assert.deepEqual(buildAnalysisMinuteOptions(1, summerGame), [
    "10",
    "9",
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
    "1",
    "0",
  ]);
});

test("analysis defaults and segment shortcuts clamp Summer League ranges to 10:00 starts", () => {
  const initial = buildInitialAnalysisForm(summerGame, true);
  assert.equal(initial.minMinutes, "10");

  const q1 = applyAnalysisSegmentShortcut("q1", summerGame, true);
  assert.equal(q1.minMinutes, "10");
  assert.equal(
    formatAnalysisPoint({ period: q1.minPeriod, minutes: q1.minMinutes, seconds: q1.minSeconds }, {
      game: summerGame,
      boundary: "start",
    }),
    "Q1 10:00",
  );
});

test("NBA analysis defaults use 12-minute periods and validate full-game ranges", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 3,
    period: 4,
    playByPlayActions: [],
  };
  const initial = buildInitialAnalysisForm(game, false);
  assert.equal(initial.minMinutes, "12");
  assert.equal(initial.maxMinutes, "0");

  const validation = validateAnalysisForm(initial, game, false);
  assert.equal(validation.error, "");
  assert.equal(validation.rangeLabel, "Q1 12:00 to Q4 0:00");
});

test("live analysis rejects ranges after the current game clock", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    period: 2,
    gameClock: "PT06M00.00S",
    playByPlayActions: [],
  };
  const validation = validateAnalysisForm({
    segmentShortcut: "custom",
    minPeriod: "1",
    minMinutes: "12",
    minSeconds: "00",
    maxPeriod: "2",
    maxMinutes: "0",
    maxSeconds: "00",
  }, game, true);
  assert.equal(validation.error, "Max time cannot be later than Q2 6:00.");
});

test("completed fixed analysis segments include overlapping halftime ranges", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    period: 2,
    gameClock: "PT00M00.00S",
    playByPlayActions: [{ actionNumber: 1 }],
  };
  const completed = buildCompletedAnalysisSegments(game, true).map((segment) => segment.key);
  assert.deepEqual(completed, ["q1", "q2", "first-half"]);
});
