import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnalysisSegmentShortcut,
  buildAnalysisMinuteOptions,
  buildInitialAnalysisForm,
  formatAnalysisPoint,
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
