import assert from "node:assert/strict";
import test from "node:test";

import { buildGameLiveStateShadowKey, claimGameLiveStateShadowLease } from "./gameLiveStateData.js";

test("game live state shadow key changes only for meaningful live-state facts", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    gameStatusText: "Q3",
    period: 3,
    gameClock: "PT06M00.00S",
    awayTeam: { teamId: "1610612752", score: 70 },
    homeTeam: { teamId: "1610612764", score: 74 },
    boxScore: {
      away: { players: [{ personId: "1" }] },
      home: { players: [{ personId: "2" }] },
    },
    playByPlayActions: [{ actionNumber: 1 }],
  };
  const minutesData = {
    periods: [{ period: 1, stints: [{ playersHome: [], playersAway: [] }] }],
  };
  const first = buildGameLiveStateShadowKey(game, minutesData);
  const cosmeticOnly = buildGameLiveStateShadowKey({
    ...game,
    officials: [{ name: "Crew Chief" }],
  }, minutesData);
  const scoreChanged = buildGameLiveStateShadowKey({
    ...game,
    homeTeam: { ...game.homeTeam, score: 77 },
  }, minutesData);
  const minutesChanged = buildGameLiveStateShadowKey(game, {
    periods: [{ period: 1, stints: [{}, {}] }],
  });

  assert.equal(first, cosmeticOnly);
  assert.notEqual(first, scoreChanged);
  assert.notEqual(first, minutesChanged);
});

test("game live state shadow key is empty without a game shape", () => {
  assert.equal(buildGameLiveStateShadowKey(null, null), "");
  assert.equal(buildGameLiveStateShadowKey({}, null), "");
});

test("game live state shadow lease skips duplicate tab writers", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
    },
  };

  assert.equal(claimGameLiveStateShadowLease("0022600001", 1000), true);
  assert.equal(claimGameLiveStateShadowLease("0022600001", 1005), true);

  const key = "nba-dash:game-live-state-shadow:0022600001";
  store.set(key, JSON.stringify({ owner: "other-tab", expiresAt: 3000 }));
  assert.equal(claimGameLiveStateShadowLease("0022600001", 2000), false);
  assert.equal(claimGameLiveStateShadowLease("0022600001", 3001), true);

  delete globalThis.window;
});
