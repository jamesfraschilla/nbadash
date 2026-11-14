import { assertEquals } from "jsr:@std/assert@1";
import { combineGLeaguePlayerRows } from "./gleagueStats.ts";

Deno.test("G League full season sums all season types before computing per-game stats", () => {
  const rows = [
    { PLAYER_ID: 7, PLAYER_NAME: "Player", TEAM_ID: 1, GP: 2, PTS: 30, REB: 10, AST: 6, BLK: 2, STL: 2, FTA: 8, FGA: 20, FG3M: 2, FG3A: 4 },
    { PLAYER_ID: 7, PLAYER_NAME: "Player", TEAM_ID: 2, GP: 3, PTS: 45, REB: 15, AST: 9, BLK: 3, STL: 3, FTA: 12, FGA: 30, FG3M: 3, FG3A: 12 },
    { PLAYER_ID: 7, PLAYER_NAME: "Player", TEAM_ID: 2, GP: 1, PTS: 25, REB: 5, AST: 3, BLK: 1, STL: 1, FTA: 4, FGA: 10, FG3M: 1, FG3A: 2 },
  ];
  const [player] = combineGLeaguePlayerRows(rows);
  assertEquals(player.gamesPlayed, 6);
  assertEquals(player.pointsPerGame, 100 / 6);
  assertEquals(player.reboundsPerGame, 5);
  assertEquals(player.fieldGoalAttemptsPerGame, 10);
  assertEquals(player.threePointAttemptsPerGame, 3);
  assertEquals(player.threePointPercentage, (6 / 18) * 100);
});
