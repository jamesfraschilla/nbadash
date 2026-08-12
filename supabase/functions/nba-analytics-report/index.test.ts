import { assert, assertEquals } from "jsr:@std/assert@1";
import { __test__ } from "./index.ts";

Deno.test("analytics report normalizes all-game and combined-season selections", () => {
  assertEquals(__test__.normalizeLastNGames("all"), 0);
  assertEquals(__test__.normalizeLastNGames(0), 0);
  assertEquals(__test__.normalizeLastNGames(30), 30);
  assertEquals(__test__.lastNGamesLabel(0), "All Games");
  assertEquals(__test__.lastNGamesLabel(10), "Last 10 Games");
  assertEquals(__test__.normalizeReportSeasonType("Regular Season and Playoffs"), "Regular Season & Playoffs");
  assertEquals(__test__.normalizeReportSeasonType("Preseason"), "Pre Season");
});

Deno.test("analytics report combines season-type payload rows by games played", () => {
  const regularPayload = {
    resultSets: [
      {
        name: "LeagueDashTeamStats",
        headers: ["TEAM_ID", "TEAM_NAME", "GP", "PTS", "FGM", "FGA", "FG_PCT", "USG_PCT_RANK"],
        rowSet: [["1610612764", "Washington Wizards", 82, 100, 40, 80, 0.5, 12]],
      },
    ],
  };
  const playoffPayload = {
    resultSets: [
      {
        name: "LeagueDashTeamStats",
        headers: ["TEAM_ID", "TEAM_NAME", "GP", "PTS", "FGM", "FGA", "FG_PCT", "USG_PCT_RANK"],
        rowSet: [["1610612764", "Washington Wizards", 10, 110, 45, 90, 0.5, 4]],
      },
    ],
  };

  const merged = __test__.mergeStatsPayloads([regularPayload, playoffPayload]);
  const row = (merged.resultSets[0].rowSet as unknown[][])[0];

  assertEquals(row[2], 92);
  assert(Math.abs(Number(row[3]) - 101.0869565) < 0.001);
  assert(Math.abs(Number(row[6]) - 0.5) < 0.001);
  assertEquals(row[7], "");
});

Deno.test("analytics report combines player payload rows by player instead of team", () => {
  const regularPayload = {
    resultSets: [
      {
        name: "LeagueDashPlayerStats",
        headers: ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "GP", "PTS", "FGM", "FGA", "FG_PCT"],
        rowSet: [
          ["1", "Player One", "1610612764", 10, 12, 5, 10, 0.5],
          ["2", "Player Two", "1610612764", 10, 8, 3, 8, 0.375],
        ],
      },
    ],
  };
  const playoffPayload = {
    resultSets: [
      {
        name: "LeagueDashPlayerStats",
        headers: ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "GP", "PTS", "FGM", "FGA", "FG_PCT"],
        rowSet: [
          ["1", "Player One", "1610612764", 2, 16, 6, 12, 0.5],
        ],
      },
    ],
  };

  const merged = __test__.mergeStatsPayloads([regularPayload, playoffPayload]);
  const rows = merged.resultSets[0].rowSet as unknown[][];

  assertEquals(rows.length, 2);
  assertEquals(rows.map((row) => row[0]), ["1", "2"]);
  assertEquals(rows[0][3], 12);
  assert(Math.abs(Number(rows[0][4]) - 12.6666667) < 0.001);
});
