import assert from "node:assert/strict";
import test from "node:test";
import {
  getGamePollingInterval,
  getGamesListPollingInterval,
  isGameDayPollingGame,
  isTrackedPollingGameId,
} from "./gamePolling.js";

const game = (overrides = {}) => ({
  gameStatus: 2,
  period: 1,
  gameClock: "PT8M00.00S",
  gameStatusText: "Q1",
  ...overrides,
});

test("adaptive polling stops after final", () => {
  assert.equal(getGamePollingInterval(game({ gameStatus: 3, gameStatusText: "Final" }), { isTrackedGame: true }), false);
});

test("adaptive polling slows down at halftime and quarter breaks", () => {
  assert.equal(getGamePollingInterval(game({ period: 2, gameClock: "PT00M00.00S", gameStatusText: "Halftime" }), { isTrackedGame: true }), 60_000);
  assert.equal(getGamePollingInterval(game({ period: 1, gameClock: "PT00M00.00S", gameStatusText: "End Q1" }), { isTrackedGame: true }), 30_000);
});

test("adaptive polling speeds up for tracked late-game windows", () => {
  assert.equal(getGamePollingInterval(game({ period: 4, gameClock: "PT3M59.00S" }), { isTrackedGame: true }), 2_000);
  assert.equal(getGamePollingInterval(game({ period: 3, gameClock: "PT59.00S" }), { isTrackedGame: true }), 5_000);
});

test("adaptive polling keeps other games at reduced live frequency", () => {
  assert.equal(getGamePollingInterval(game({ period: 4, gameClock: "PT3M59.00S" }), { isTrackedGame: false }), 30_000);
  assert.equal(getGamePollingInterval(game({ period: 3, gameClock: "PT59.00S" }), { isTrackedGame: false }), 30_000);
  assert.equal(getGamePollingInterval(game({ gameStatus: 1, gameClock: "", gameStatusText: "7:00 PM" }), { isTrackedGame: false }), 120_000);
});

test("adaptive polling sleeps until the pregame window for known future tip times", () => {
  const now = Date.parse("2026-07-08T20:00:00Z");
  const futureGame = game({
    gameStatus: 1,
    gameClock: "",
    gameStatusText: "7:00 PM",
    gameTimeUTC: "2026-07-08T23:00:00Z",
  });

  assert.equal(getGamePollingInterval(futureGame, { isTrackedGame: false, now }), 150 * 60_000);
});

test("adaptive polling keeps the normal pregame interval inside the pregame window", () => {
  const now = Date.parse("2026-07-08T22:40:00Z");
  const futureGame = game({
    gameStatus: 1,
    gameClock: "",
    gameStatusText: "7:00 PM",
    gameTimeUTC: "2026-07-08T23:00:00Z",
  });

  assert.equal(getGamePollingInterval(futureGame, { isTrackedGame: false, now }), 120_000);
});

test("adaptive polling speeds up after scheduled tip if the game has not switched live yet", () => {
  const now = Date.parse("2026-07-08T23:05:00Z");
  const tippingGame = game({
    gameStatus: 1,
    gameClock: "",
    gameStatusText: "7:00 PM",
    gameTimeUTC: "2026-07-08T23:00:00Z",
  });

  assert.equal(getGamePollingInterval(tippingGame, { isTrackedGame: false, now }), 30_000);
});

test("adaptive polling stops stale pregame rows long after the scheduled tip", () => {
  const now = Date.parse("2026-07-09T06:30:00Z");
  const staleGame = game({
    gameStatus: 1,
    gameClock: "",
    gameStatusText: "7:00 PM",
    gameTimeUTC: "2026-07-08T23:00:00Z",
  });

  assert.equal(getGamePollingInterval(staleGame, { isTrackedGame: false, now }), false);
});

test("game 1322600002 uses tracked polling intervals", () => {
  assert.equal(isTrackedPollingGameId("1322600002"), true);
  assert.equal(getGamePollingInterval(game({ gameId: "1322600002", period: 4, gameClock: "PT3M59.00S" })), 2_000);
  assert.equal(getGamePollingInterval(game({ gameId: "1322600002", period: 3, gameClock: "PT59.00S" })), 5_000);
});

test("Summer League games use game-day polling intervals", () => {
  assert.equal(isGameDayPollingGame("1322600008"), true);
  assert.equal(getGamePollingInterval(game({ gameId: "1322600008", period: 4, gameClock: "PT3M59.00S" })), 2_000);
});

test("Washington games use game-day polling intervals", () => {
  const washingtonGame = game({
    gameId: "0022600001",
    period: 4,
    gameClock: "PT3M59.00S",
    homeTeam: { teamTricode: "WAS" },
    awayTeam: { teamTricode: "BOS" },
  });
  assert.equal(isGameDayPollingGame(washingtonGame), true);
  assert.equal(getGamePollingInterval(washingtonGame), 2_000);
});

test("game lists poll at the fastest active game interval", () => {
  const games = [
    game({ gameStatus: 1, gameClock: "", gameStatusText: "7:00 PM", homeTeam: { teamTricode: "BOS" }, awayTeam: { teamTricode: "NYK" } }),
    game({ period: 4, gameClock: "PT2M00.00S", homeTeam: { teamTricode: "WAS" }, awayTeam: { teamTricode: "ATL" } }),
  ];
  assert.equal(getGamesListPollingInterval(games, {
    isTrackedGame: (entry) => entry.homeTeam.teamTricode === "WAS" || entry.awayTeam.teamTricode === "WAS",
  }), 2_000);
});

test("game lists sleep until the next known pregame window when no games are active", () => {
  const now = Date.parse("2026-07-08T20:00:00Z");
  const games = [
    game({
      gameStatus: 3,
      gameStatusText: "Final",
      gameTimeUTC: "2026-07-08T18:00:00Z",
    }),
    game({
      gameStatus: 1,
      gameClock: "",
      gameStatusText: "7:00 PM",
      gameTimeUTC: "2026-07-08T23:00:00Z",
    }),
  ];

  assert.equal(getGamesListPollingInterval(games, { now }), 150 * 60_000);
});

test("game lists stop polling when every game is final or stale pregame", () => {
  const now = Date.parse("2026-07-09T06:30:00Z");
  const games = [
    game({
      gameStatus: 3,
      gameStatusText: "Final",
      gameTimeUTC: "2026-07-08T18:00:00Z",
    }),
    game({
      gameStatus: 1,
      gameClock: "",
      gameStatusText: "7:00 PM",
      gameTimeUTC: "2026-07-08T23:00:00Z",
    }),
  ];

  assert.equal(getGamesListPollingInterval(games, { now }), false);
});
