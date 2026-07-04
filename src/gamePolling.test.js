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
