import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeGameMidrangeStats,
  normalizeMidrangeStatLine,
} from "./boxScoreNormalization.js";

test("combines the NBA feed's split short and long mid-range fields", () => {
  assert.deepEqual(normalizeMidrangeStatLine({
    shortMidFieldGoalsMade: 2,
    shortMidFieldGoalsAttempted: 3,
    longMidFieldGoalsMade: 1,
    longMidFieldGoalsAttempted: 5,
  }), {
    shortMidFieldGoalsMade: 2,
    shortMidFieldGoalsAttempted: 3,
    longMidFieldGoalsMade: 1,
    longMidFieldGoalsAttempted: 5,
    midFieldGoalsMade: 3,
    midFieldGoalsAttempted: 8,
  });
});

test("preserves an existing combined mid-range total", () => {
  const normalized = normalizeMidrangeStatLine({
    midFieldGoalsMade: 4,
    midFieldGoalsAttempted: 7,
    shortMidFieldGoalsMade: 1,
    shortMidFieldGoalsAttempted: 2,
    longMidFieldGoalsMade: 1,
    longMidFieldGoalsAttempted: 2,
  });
  assert.equal(normalized.midFieldGoalsMade, 4);
  assert.equal(normalized.midFieldGoalsAttempted, 7);
});

test("normalizes team and player mid-range lines without changing the source payload", () => {
  const game = {
    boxScore: {
      away: {
        totals: { shortMidFieldGoalsMade: 2, longMidFieldGoalsMade: 3, shortMidFieldGoalsAttempted: 4, longMidFieldGoalsAttempted: 5 },
        players: [{ personId: 1, shortMidFieldGoalsMade: 1, longMidFieldGoalsMade: 2, shortMidFieldGoalsAttempted: 2, longMidFieldGoalsAttempted: 3 }],
      },
      home: {
        totals: { shortMidFieldGoalsMade: 1, longMidFieldGoalsMade: 1, shortMidFieldGoalsAttempted: 3, longMidFieldGoalsAttempted: 2 },
        players: [],
      },
    },
  };
  const normalized = normalizeGameMidrangeStats(game);
  assert.equal(normalized.boxScore.away.totals.midFieldGoalsMade, 5);
  assert.equal(normalized.boxScore.away.totals.midFieldGoalsAttempted, 9);
  assert.equal(normalized.boxScore.away.players[0].midFieldGoalsMade, 3);
  assert.equal(normalized.boxScore.home.totals.midFieldGoalsAttempted, 5);
  assert.equal(game.boxScore.away.totals.midFieldGoalsMade, undefined);
});
