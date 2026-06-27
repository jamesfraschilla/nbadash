import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseDirectSummerLeagueGame } from "./summerLeagueGameSource.js";

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
