import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { __test__ } from "./index.ts";

const baseGame = {
  gameId: "0022600001",
  seasonYear: "2026",
  seasonType: "Regular Season",
  gameStatus: 2,
  gameStatusText: "Q2",
  gameClock: "PT05M12.00S",
  period: 2,
  gameDate: "2026-10-28",
  awayTeam: {
    teamId: "1610612752",
    teamTricode: "NYK",
    teamCity: "New York",
    teamName: "Knicks",
    score: 44,
  },
  homeTeam: {
    teamId: "1610612764",
    teamTricode: "WAS",
    teamCity: "Washington",
    teamName: "Wizards",
    score: 48,
  },
  boxScore: {
    away: { players: [{ personId: "1" }, { personId: "2" }] },
    home: { players: [{ personId: "3" }] },
  },
  playByPlayActions: [
    { actionNumber: 1, period: 1, clock: "PT11M45.00S", timeActual: "2026-10-28T23:10:00Z" },
    { actionNumber: 2, period: 2, clock: "PT05M12.00S", timeActual: "2026-10-29T00:02:00Z" },
  ],
};

Deno.test("game live state normalizes compact scoreboard, counts, and availability", async () => {
  const snapshot = await __test__.normalizeGameLiveState("0022600001", baseGame, {
    periods: [
      { period: 1, stints: [{ playersHome: [], playersAway: [] }] },
      { period: 2, stints: [{ playersHome: [], playersAway: [] }, { playersHome: [], playersAway: [] }] },
    ],
  });

  assertEquals(snapshot.league, "nba");
  assertEquals(snapshot.gameStatus, 2);
  assertEquals(snapshot.sourceUpdatedAt, "2026-10-29T00:02:00.000Z");
  assertEquals(snapshot.payload.teams.home.tricode, "WAS");
  assertEquals(snapshot.payload.counts.playByPlayActions, 2);
  assertEquals(snapshot.payload.counts.boxScorePlayers, 3);
  assertEquals(snapshot.payload.counts.minutesPeriods, 2);
  assertEquals(snapshot.payload.counts.minutesStints, 3);
  assertEquals(snapshot.payload.availability.minutes, true);
  assertEquals(snapshot.diagnostics.quality, "ok");
});

Deno.test("game live state warns when live data is missing", async () => {
  const snapshot = await __test__.normalizeGameLiveState("0022600001", {
    ...baseGame,
    boxScore: null,
    playByPlayActions: [],
  }, null);

  assertEquals(snapshot.payload.counts.playByPlayActions, 0);
  assertEquals(snapshot.payload.counts.boxScorePlayers, 0);
  assertEquals(snapshot.payload.availability.minutes, false);
  assertEquals(snapshot.diagnostics.quality, "warning");
  assertEquals((snapshot.diagnostics.warnings as string[]).length, 3);
});

Deno.test("game live state source signature changes when scoreboard facts change", async () => {
  const first = await __test__.normalizeGameLiveState("0022600001", baseGame, null);
  const second = await __test__.normalizeGameLiveState("0022600001", {
    ...baseGame,
    homeTeam: {
      ...baseGame.homeTeam,
      score: 51,
    },
  }, null);

  assertNotEquals(first.sourceSignature, second.sourceSignature);
});

Deno.test("game live state infers G League from G League team ids", async () => {
  const snapshot = await __test__.normalizeGameLiveState("2022600001", {
    ...baseGame,
    awayTeam: {
      ...baseGame.awayTeam,
      teamId: "1612709902",
    },
  }, null);

  assertEquals(snapshot.league, "gleague");
});
