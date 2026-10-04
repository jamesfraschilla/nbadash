import assert from "node:assert/strict";
import test from "node:test";
import {
  completedPeriodElapsedSeconds,
  resolveLivePeriodBreak,
} from "./liveGameClock.js";

const liveGame = (overrides = {}) => ({
  gameStatus: 2,
  period: 2,
  gameClock: "PT11M29.00S",
  playByPlayActions: [],
  ...overrides,
});

const periodEnd = (period) => ({
  actionNumber: period * 100,
  actionType: "period",
  subType: "end",
  period,
  clock: "PT00M00.00S",
});

test("Q2 period end overrides an arena halftime countdown", () => {
  assert.deepEqual(
    resolveLivePeriodBreak(liveGame({ playByPlayActions: [periodEnd(1), periodEnd(2)] })),
    { completedPeriod: 2, status: "Halftime", clock: null }
  );
  assert.equal(completedPeriodElapsedSeconds(2), 24 * 60);
});

test("Q1 and Q3 breaks retain quarter labels and show 0:00", () => {
  assert.deepEqual(
    resolveLivePeriodBreak(liveGame({
      period: 1,
      gameClock: "PT02M00.00S",
      playByPlayActions: [periodEnd(1)],
    })),
    { completedPeriod: 1, status: "Q1", clock: "0:00" }
  );
  assert.deepEqual(
    resolveLivePeriodBreak(liveGame({
      period: 3,
      gameClock: "PT02M00.00S",
      playByPlayActions: [periodEnd(1), periodEnd(2), periodEnd(3)],
    })),
    { completedPeriod: 3, status: "Q3", clock: "0:00" }
  );
});

test("the break ends as soon as the next period appears in play-by-play", () => {
  assert.equal(
    resolveLivePeriodBreak(liveGame({
      period: 3,
      gameClock: "PT12M00.00S",
      playByPlayActions: [
        periodEnd(1),
        periodEnd(2),
        { actionNumber: 201, actionType: "period", subType: "start", period: 3, clock: "PT12M00.00S" },
      ],
    })),
    null
  );
});

test("completed games do not use live period-break overrides", () => {
  assert.equal(
    resolveLivePeriodBreak(liveGame({
      gameStatus: 3,
      playByPlayActions: [periodEnd(1), periodEnd(2)],
    })),
    null
  );
});
