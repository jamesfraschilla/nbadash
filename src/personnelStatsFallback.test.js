import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEspnPlayerStatsUrl,
  normalizeEspnPlayerStatsPages,
  parseNbaPlayerStatsMarkdown,
} from "./personnelStatsFallback.js";

test("fallback stats URL requests the regular season ending year", () => {
  const url = new URL(buildEspnPlayerStatsUrl("2025-26", 2));
  assert.equal(url.searchParams.get("season"), "2026");
  assert.equal(url.searchParams.get("seasontype"), "2");
  assert.equal(url.searchParams.get("page"), "2");
});

test("official NBA page fallback parses the overall per-game row", () => {
  const markdown = [
    "| Overall | GP | MIN | PTS | FGM | FGA | FG% | 3PM | 3PA | 3P% | FTM | FTA | FT% | OREB | DREB | REB | AST | TOV | STL | BLK |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| 2025-26 | 48 | 27.2 | 16.3 | [6.6](https://nba.test/fgm) | [13.7](https://nba.test/fga) | 48.2 | 1.0 | [3.1](https://nba.test/fg3a) | 33.3 | 2.1 | 3.0 | 69.2 | 2.2 | 5.2 | [7.4](https://nba.test/reb) | 2.7 | 1.7 | 0.8 | 2.0 |",
  ].join("\n");
  assert.deepEqual(parseNbaPlayerStatsMarkdown(markdown, {
    personId: "1642259",
    fullName: "Alex Sarr",
    teamId: "1610612764",
  }, "2025-26"), {
    personId: "1642259",
    fullName: "Alex Sarr",
    teamId: "1610612764",
    gamesPlayed: 48,
    pointsPerGame: 16.3,
    fieldGoalAttemptsPerGame: 13.7,
    threePointAttemptsPerGame: 3.1,
    threePointPercentage: 33.3,
    freeThrowAttemptsPerGame: 3,
    reboundsPerGame: 7.4,
    assistsPerGame: 2.7,
    stealsPerGame: 0.8,
    blocksPerGame: 2,
  });
  assert.equal(parseNbaPlayerStatsMarkdown("No data available", {
    personId: "1643407",
    fullName: "AJ Dybantsa",
  }, "2025-26"), null);
});

test("fallback pages normalize every personnel stat and preserve an empty season", () => {
  const categories = [
    { name: "general", names: ["gamesPlayed", "avgRebounds"] },
    {
      name: "offensive",
      names: [
        "avgPoints",
        "avgFieldGoalsAttempted",
        "avgThreePointFieldGoalsAttempted",
        "threePointFieldGoalPct",
        "avgFreeThrowsAttempted",
        "avgAssists",
      ],
    },
    { name: "defensive", names: ["avgSteals", "avgBlocks"] },
  ];
  const payload = normalizeEspnPlayerStatsPages([{
    categories,
    athletes: [{
      athlete: { id: "123", displayName: "Example Player", teamShortName: "WAS" },
      categories: [
        { name: "general", values: [72, 4.2] },
        { name: "offensive", values: [20.2, 10.2, 3.1, 38.2, 3.5, 1.6] },
        { name: "defensive", values: [1.1, 0.4] },
      ],
    }],
  }], "2025-26");

  assert.equal(payload.source, "espn-browser-fallback");
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.players["espn-123"], {
    personId: "espn-123",
    fullName: "Example Player",
    teamId: "",
    teamAbbreviation: "WAS",
    gamesPlayed: 72,
    pointsPerGame: 20.2,
    reboundsPerGame: 4.2,
    threePointPercentage: 38.2,
    assistsPerGame: 1.6,
    blocksPerGame: 0.4,
    stealsPerGame: 1.1,
    freeThrowAttemptsPerGame: 3.5,
    fieldGoalAttemptsPerGame: 10.2,
    threePointAttemptsPerGame: 3.1,
  });

  const empty = normalizeEspnPlayerStatsPages([{}], "2026-27");
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.players, {});
});
