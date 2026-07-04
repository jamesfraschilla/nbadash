import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSummerLeagueMinutesData,
  shouldUseDirectSummerLeagueGame,
} from "./summerLeagueGameSource.js";

test("uses direct Summer League API shells for pregame payloads", () => {
  assert.equal(shouldUseDirectSummerLeagueGame({
    gameStatus: 1,
    boxScore: { home: { players: [] }, away: { players: [] } },
    teamStats: { home: {}, away: {} },
    playByPlayActions: null,
  }), true);
});

test("requires play-by-play before using direct live Summer League payloads", () => {
  assert.equal(shouldUseDirectSummerLeagueGame({
    gameStatus: 2,
    boxScore: { home: { players: [] }, away: { players: [] } },
    teamStats: { home: {}, away: {} },
    playByPlayActions: [],
  }), false);

  assert.equal(shouldUseDirectSummerLeagueGame({
    gameStatus: 2,
    boxScore: { home: { players: [] }, away: { players: [] } },
    teamStats: { home: {}, away: {} },
    playByPlayActions: [{ actionNumber: 1 }],
  }), true);
});

test("clamps Summer League minutes stints to 10-minute regulation periods", () => {
  const normalized = normalizeSummerLeagueMinutesData("1322600001", {
    periods: [
      {
        period: 1,
        stints: [
          { startClock: "12:00", endClock: "6:16" },
          { startClock: "6:16", endClock: "0:00" },
        ],
      },
      {
        period: 2,
        stints: [
          { startClock: "10:00", endClock: "0:00" },
        ],
      },
    ],
  });

  assert.equal(normalized.periods[0].stints[0].startClock, "10:00");
  assert.equal(normalized.periods[0].stints[0].endClock, "6:16");
  assert.equal(normalized.periods[1].stints[0].startClock, "10:00");
});

test("leaves non-Summer League minutes stints unchanged", () => {
  const data = {
    periods: [
      {
        period: 1,
        stints: [
          { startClock: "12:00", endClock: "6:16" },
        ],
      },
    ],
  };

  assert.equal(normalizeSummerLeagueMinutesData("0022600001", data), data);
});
