import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKeyInTimeZone,
  incompleteGameIds,
  recentCompletedDateKeys,
  selectCompletedScheduleGames,
} from "./officiatingNightlyIngestion.js";

test("builds Eastern date keys across UTC midnight", () => {
  const now = new Date("2026-11-02T04:30:00Z");
  assert.equal(dateKeyInTimeZone(now), "2026-11-01");
  assert.deepEqual(recentCompletedDateKeys({ now, lookbackDays: 3 }), [
    "2026-10-31",
    "2026-10-30",
    "2026-10-29",
  ]);
});

test("selects only final, recent, non-preseason games", () => {
  const payload = {
    leagueSchedule: {
      seasonYear: "2026-27",
      gameDates: [{ games: [
        { gameId: "0022600001", gameDateEst: "2026-10-28", gameStatus: 3 },
        { gameId: "0022600002", gameDateEst: "2026-10-28", gameStatus: 2 },
        { gameId: "0012600003", gameDateEst: "2026-10-28", gameStatus: 3 },
        { gameId: "0022600004", gameDateEst: "2026-10-27", gameStatus: 3 },
      ] }],
    },
  };
  assert.deepEqual(selectCompletedScheduleGames(payload, {
    season: "2026-27",
    dateKeys: ["2026-10-28"],
  }).map((game) => game.gameId), ["0022600001"]);
});

test("retries games with missing assignments or suspiciously few calls", () => {
  const games = [{ gameId: "a" }, { gameId: "b" }, { gameId: "c" }];
  const assignments = [
    ...Array.from({ length: 3 }, () => ({ game_id: "a", is_alternate: false })),
    ...Array.from({ length: 2 }, () => ({ game_id: "b", is_alternate: false })),
    ...Array.from({ length: 3 }, () => ({ game_id: "c", is_alternate: false })),
    { game_id: "c", is_alternate: true },
  ];
  const calls = [
    ...Array.from({ length: 20 }, () => ({ game_id: "a" })),
    ...Array.from({ length: 25 }, () => ({ game_id: "b" })),
    ...Array.from({ length: 19 }, () => ({ game_id: "c" })),
  ];
  assert.deepEqual(incompleteGameIds(games, assignments, calls), ["b", "c"]);
});
