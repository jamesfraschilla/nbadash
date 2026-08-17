import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getNbaCupInfo, isNbaCupGame } from "./nbaCup.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("NBA Cup metadata stays in sync with the static schedule", () => {
  const schedule = readJson("src/data/nbaSchedule2026_27.json");
  const cupSchedule = readJson("src/data/nbaCupGames2026_27.json");
  const scheduleByGameId = new Map(schedule.games.map((game) => [String(game.gameId), game]));
  const scheduleCupGameIds = new Set(
    schedule.games
      .filter((game) => isNbaCupGame(game))
      .map((game) => String(game.gameId)),
  );

  assert.ok(cupSchedule.games.length > 0);
  assert.equal(cupSchedule.games.length, scheduleCupGameIds.size);

  cupSchedule.games.forEach((cupGame) => {
    const scheduleGame = scheduleByGameId.get(String(cupGame.gameId));
    assert.ok(scheduleGame, `Missing static schedule game ${cupGame.gameId}`);
    assert.equal(scheduleCupGameIds.has(String(cupGame.gameId)), true);
    assert.equal(isNbaCupGame(scheduleGame), true);
    assert.equal(getNbaCupInfo({ ...scheduleGame, ...cupGame }).isNbaCup, true);
  });
});

test("NBA Cup info infers stage from public labels", () => {
  assert.deepEqual(
    getNbaCupInfo({
      gameLabel: "Emirates NBA Cup",
      gameSubLabel: "East Group C",
      gameSubtype: "in-season",
    }),
    {
      gameLabel: "Emirates NBA Cup",
      gameSubLabel: "East Group C",
      gameSubtype: "in-season",
      isNbaCup: true,
      nbaCupStage: "Group Play",
      nbaCupGroup: "East Group C",
    },
  );
});
