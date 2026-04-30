import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLateGameStrategyState,
  evaluateLateGameStrategy,
} from "./lateGameStrategy.js";

const ORL = {
  teamId: "1610612753",
  teamTricode: "ORL",
  teamName: "Magic",
  score: 109,
};

const DET = {
  teamId: "1610612765",
  teamTricode: "DET",
  teamName: "Pistons",
  score: 116,
};

function buildGame(overrides = {}) {
  return {
    gameStatus: 2,
    period: 4,
    gameClock: "PT30S",
    awayTeam: ORL,
    homeTeam: DET,
    playByPlayActions: [
      {
        actionType: "2pt",
        teamId: DET.teamId,
        possession: DET.teamId,
        period: 4,
        clock: "PT30S",
        description: "Cunningham driving layup",
      },
    ],
    ...overrides,
  };
}

test("changing vantage changes margin perspective but not live possession source", () => {
  const game = buildGame();

  const orlState = buildLateGameStrategyState({
    game,
    vantageTeamId: ORL.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });
  const detState = buildLateGameStrategyState({
    game,
    vantageTeamId: DET.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });

  assert.equal(orlState.possessionTeamId, DET.teamId);
  assert.equal(detState.possessionTeamId, DET.teamId);
  assert.equal(orlState.isOurPossession, false);
  assert.equal(detState.isOurPossession, true);
  assert.equal(orlState.scoreDiff, -7);
  assert.equal(detState.scoreDiff, 7);
});

test("opponent shooting foul creates next-possession free throw scenarios", () => {
  const game = buildGame({
    gameClock: "PT9S",
    awayTeam: { ...ORL, score: 112 },
    homeTeam: { ...DET, score: 114 },
    playByPlayActions: [
      {
        actionType: "2pt",
        teamId: DET.teamId,
        possession: DET.teamId,
        period: 4,
        clock: "PT9S",
        shotResult: "missed",
        description: "Cunningham driving layup missed",
      },
      {
        actionType: "foul",
        teamId: ORL.teamId,
        possession: DET.teamId,
        period: 4,
        clock: "PT9S",
        descriptor: "Shooting",
        description: "Banchero shooting foul",
      },
    ],
  });

  const state = buildLateGameStrategyState({
    game,
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 2,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });
  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(evaluation.status, "ready");
  assert.equal(evaluation.freeThrowLookahead.totalAwarded, 2);
  assert.deepEqual(
    evaluation.freeThrowLookahead.scenarios.map((scenario) => scenario.projectedScoreLabel),
    ["-2", "-3", "-4"]
  );
  assert.deepEqual(
    evaluation.freeThrowLookahead.scenarios.map((scenario) => scenario.recommendation.call),
    ["Lob / tip", "Draw foul", "Draw foul"]
  );
});

test("final games keep the strategy engine inactive", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({ gameStatus: 3, gameClock: "PT0S" }),
    vantageTeamId: ORL.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(evaluation.status, "inactive");
  assert.equal(evaluation.headline, "Late Game Strategy is inactive");
});
