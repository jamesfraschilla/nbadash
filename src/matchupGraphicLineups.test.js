import assert from "node:assert/strict";
import test from "node:test";
import {
  MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID,
  buildMatchupGraphicLineupFromDraft,
  buildMatchupGraphicLineupMap,
  getDefaultMatchupGraphicTeamId,
  getMatchupGraphicLineupKey,
  normalizeMatchupGraphicLineup,
} from "./matchupGraphicLineups.js";

test("match-up lineup keys are scoped by league and team", () => {
  assert.equal(getMatchupGraphicLineupKey("nba", "1610612764"), "nba:1610612764");
  assert.equal(getMatchupGraphicLineupKey("gleague", "1612709928"), "gleague:1612709928");
});

test("Washington is the default first NBA team for every user profile", () => {
  assert.equal(getDefaultMatchupGraphicTeamId("nba", []), "1610612764");
  assert.equal(getDefaultMatchupGraphicTeamId("nba", ["capital_city"]), "1610612764");
  assert.equal(getDefaultMatchupGraphicTeamId("gleague", ["capital_city"]), "1612709928");
});

test("match-up lineups retain five player selections and custom edits", () => {
  const lineup = normalizeMatchupGraphicLineup({
    scope_key: "nba:1610612764",
    payload: {
      playerIds: ["1", MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID],
      customPlayers: [{}, { jerseyNum: "00", lastName: "Prospect", headshotDataUrl: "data:image/png;base64,abc" }],
      players: [{ personId: "1", fullName: "Saved Player", jerseyNum: "1" }],
    },
  });

  assert.equal(lineup.teamId, "1610612764");
  assert.equal(lineup.playerIds.length, 5);
  assert.equal(lineup.playerIds[1], MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID);
  assert.equal(lineup.customPlayers[1].lastName, "Prospect");
  assert.equal(lineup.players[0].fullName, "Saved Player");
});

test("draft player choices produce shared team lineups and roster snapshots", () => {
  const lineup = buildMatchupGraphicLineupFromDraft({
    league: "nba",
    leftTeamId: "1610612764",
    leftPlayerIds: ["1", MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID, "", "", ""],
    leftCustomPlayers: [{}, { jerseyNum: "7", lastName: "Custom" }],
  }, "left", [{ personId: "1", fullName: "Roster Player", jerseyNum: "1", teamId: "1610612764" }]);

  assert.equal(lineup.players[0].fullName, "Roster Player");
  assert.equal(lineup.customPlayers[1].lastName, "Custom");
  assert.equal(buildMatchupGraphicLineupMap([lineup])["nba:1610612764"].playerIds[0], "1");
});
