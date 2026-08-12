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
