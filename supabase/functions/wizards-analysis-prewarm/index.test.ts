import { assertEquals } from "jsr:@std/assert@1";
import { __test__ } from "./index.ts";

const wizardsHomeGame = {
  gameId: "0022600001",
  gameStatus: 2,
  period: 2,
  gameClock: "PT12M00.00S",
  gameTimeUTC: "2026-11-01T23:00:00Z",
  homeTeam: { teamId: "1610612764", teamTricode: "WAS", teamName: "Wizards" },
  awayTeam: { teamId: "1610612752", teamTricode: "NYK", teamName: "Knicks" },
};

Deno.test("Wizards prewarm completes Q1 at start of Q2", () => {
  const segments = __test__.buildCompletedSegments(wizardsHomeGame, true).map((segment) => segment.key);
  assertEquals(segments, ["q1"]);
});

Deno.test("Wizards prewarm completes halftime segments at end of Q2", () => {
  const segments = __test__.buildCompletedSegments({
    ...wizardsHomeGame,
    period: 2,
    gameClock: "PT00M00.00S",
  }, true).map((segment) => segment.key);
  assertEquals(segments, ["q1", "q2", "first-half"]);
});

Deno.test("Wizards prewarm includes every standard segment for recent finals", () => {
  const now = new Date("2026-11-02T03:00:00Z");
  const game = {
    ...wizardsHomeGame,
    gameStatus: 3,
    period: 4,
    gameClock: "PT00M00.00S",
    gameTimeUTC: "2026-11-02T00:00:00Z",
  };
  const segments = __test__.buildCompletedSegments(game, false).map((segment) => segment.key);
  assertEquals(segments, ["all", "q1", "q2", "q3", "q1-q3", "q4", "first-half", "second-half"]);
  assertEquals(__test__.shouldProcessGame(game, now), true);
});

Deno.test("Wizards prewarm ignores old finals and non-Wizards games", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assertEquals(__test__.shouldProcessGame({
    ...wizardsHomeGame,
    gameStatus: 3,
    gameTimeUTC: "2026-11-02T00:00:00Z",
  }, now), false);

  assertEquals(__test__.isWashingtonGame({
    homeTeam: { teamId: "1610612738", teamTricode: "BOS" },
    awayTeam: { teamId: "1610612752", teamTricode: "NYK" },
  }), false);
});

Deno.test("Wizards prewarm builds frontend-compatible analysis labels", () => {
  assertEquals(__test__.buildAnalysisRange({
    value: "q1",
    label: "Q1",
    minPeriod: 1,
    minMinutes: 12,
    minSeconds: 0,
    maxPeriod: 1,
    maxMinutes: 0,
    maxSeconds: 0,
  }), {
    minPeriod: 1,
    minClock: "12:00",
    minLabel: "Q1 12:00",
    maxPeriod: 1,
    maxClock: "0:00",
    maxLabel: "Q1 0:00",
  });
});
