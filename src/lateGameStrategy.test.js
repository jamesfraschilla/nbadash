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
    ["Need 2, prefer 3", "Need 3", "Need 3"]
  );
});

test("latest jump ball shows both win/lose strategy branches", () => {
  const game = buildGame({
    gameClock: "PT16S",
    awayTeam: { ...ORL, score: 97 },
    homeTeam: { ...DET, score: 95 },
    playByPlayActions: [
      {
        actionType: "jumpball",
        teamId: "",
        possession: "",
        period: 4,
        clock: "PT16S",
        description: "Jump Ball Cunningham vs Banchero",
      },
    ],
  });

  const state = buildLateGameStrategyState({
    game,
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 5,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });
  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(evaluation.status, "ready");
  assert.equal(evaluation.jumpBallLookahead.headline, "Jump ball branches");
  assert.equal(evaluation.jumpBallLookahead.scenarios.length, 2);
  assert.deepEqual(
    evaluation.jumpBallLookahead.scenarios.map((scenario) => scenario.label),
    ["If we win jump ball", "If we lose jump ball"]
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

test("manual overrides allow simulation when the game is final", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({ gameStatus: 3, gameClock: "PT0S" }),
    vantageTeamId: ORL.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
    manualOverrides: {
      period: "4",
      clock: "0:29",
      scoreDiff: "-2",
      possessionTeamId: ORL.teamId,
      ourTimeouts: "2",
      opponentTimeouts: "1",
      ourFouls: "4",
      opponentFouls: "3",
    },
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isSimulation, true);
  assert.equal(evaluation.status, "ready");
  assert.match(evaluation.notes.join(" "), /simulation mode/i);
});

test("down two on defense with 39 seconds left stays in normal defense", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT39S",
      awayTeam: { ...ORL, score: 100 },
      homeTeam: { ...DET, score: 102 },
      playByPlayActions: [
        {
          actionType: "turnover",
          teamId: ORL.teamId,
          possession: DET.teamId,
          period: 4,
          clock: "PT39S",
          description: "ORL turnover",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 4,
    awayTimeoutsRemaining: 2,
    homeTimeoutsRemaining: 2,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, false);
  assert.equal(state.scoreDiff, -2);
  assert.equal(evaluation.recommendation.call, "Defend normally");
});

test("down two on offense with 39 seconds left stays in 2 for 1", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT39S",
      awayTeam: { ...ORL, score: 100 },
      homeTeam: { ...DET, score: 102 },
      playByPlayActions: [
        {
          actionType: "madebasket",
          teamId: ORL.teamId,
          possession: ORL.teamId,
          period: 4,
          clock: "PT39S",
          description: "ORL inbounds",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 4,
    awayTimeoutsRemaining: 2,
    homeTimeoutsRemaining: 2,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, true);
  assert.equal(state.scoreDiff, -2);
  assert.equal(evaluation.recommendation.call, "2 For 1");
});

test("up three on defense with 31 seconds left goes to no 3 defense", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT31S",
      awayTeam: { ...ORL, score: 102 },
      homeTeam: { ...DET, score: 99 },
      playByPlayActions: [
        {
          actionType: "turnover",
          teamId: ORL.teamId,
          possession: DET.teamId,
          period: 4,
          clock: "PT31S",
          description: "ORL turnover",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 3,
    homeFouls: 4,
    awayTimeoutsRemaining: 2,
    homeTimeoutsRemaining: 2,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, false);
  assert.equal(state.scoreDiff, 3);
  assert.equal(evaluation.recommendation.call, "No 3 defense");
});

test("up two on offense with 18 seconds left shifts to ball security", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT18S",
      awayTeam: { ...ORL, score: 102 },
      homeTeam: { ...DET, score: 100 },
      playByPlayActions: [
        {
          actionType: "madebasket",
          teamId: ORL.teamId,
          possession: ORL.teamId,
          period: 4,
          clock: "PT18S",
          description: "ORL inbounds",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 4,
    awayTimeoutsRemaining: 2,
    homeTimeoutsRemaining: 2,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, true);
  assert.equal(state.scoreDiff, 2);
  assert.equal(evaluation.recommendation.call, "Ball security");
});

test("tied defense with 3 seconds left goes to no catch and shoot", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT3S",
      awayTeam: { ...ORL, score: 100 },
      homeTeam: { ...DET, score: 100 },
      playByPlayActions: [
        {
          actionType: "timeout",
          teamId: DET.teamId,
          possession: DET.teamId,
          period: 4,
          clock: "PT3S",
          description: "DET timeout",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 4,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 1,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, false);
  assert.equal(state.scoreDiff, 0);
  assert.equal(evaluation.recommendation.call, "No catch & shoot");
});

test("up three on defense with 4 seconds left now fouls", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT4S",
      awayTeam: { ...ORL, score: 100 },
      homeTeam: { ...DET, score: 97 },
      playByPlayActions: [
        {
          actionType: "turnover",
          teamId: ORL.teamId,
          possession: DET.teamId,
          period: 4,
          clock: "PT4S",
          description: "ORL turnover",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 4,
    homeFouls: 4,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 1,
  });

  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.isOurPossession, false);
  assert.equal(state.scoreDiff, 3);
  assert.equal(evaluation.recommendation.call, "Foul");
});

test("stale play-by-play feed exposes low confidence and likely next recommendation", () => {
  const game = buildGame({
    gameClock: "PT10S",
    playByPlayActions: [
      {
        actionType: "2pt",
        teamId: DET.teamId,
        possession: DET.teamId,
        period: 4,
        clock: "PT30S",
        shotResult: "made",
        description: "Cunningham driving layup made",
      },
    ],
  });

  const state = buildLateGameStrategyState({
    game,
    vantageTeamId: ORL.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
  });
  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(evaluation.feedStatus.level, "low");
  assert.equal(evaluation.feedStatus.secondsBehind, 20);
  assert.equal(evaluation.projectedNext.possessionTeamId, ORL.teamId);
  assert.equal(evaluation.projectedNext.recommendation.call, "Need 3");
});

test("manual possession override temporarily flips the evaluated recommendation", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({ gameClock: "PT10S" }),
    vantageTeamId: ORL.teamId,
    awayFouls: 2,
    homeFouls: 3,
    awayTimeoutsRemaining: 1,
    homeTimeoutsRemaining: 2,
    manualOverrides: { possessionFlip: true },
  });
  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.feedPossessionTeamId, DET.teamId);
  assert.equal(state.possessionTeamId, ORL.teamId);
  assert.equal(state.isOurPossession, true);
  assert.equal(evaluation.recommendation.call, "Need 3");
  assert.match(evaluation.notes.join(" "), /possession flipped/i);
});

test("manual situation values override feed state for matrix simulation", () => {
  const state = buildLateGameStrategyState({
    game: buildGame({
      gameClock: "PT0S",
      gameStatus: 2,
      playByPlayActions: [
        {
          actionType: "turnover",
          teamId: DET.teamId,
          possession: DET.teamId,
          period: 4,
          clock: "PT0S",
          description: "DET turnover",
        },
      ],
    }),
    vantageTeamId: ORL.teamId,
    awayFouls: 1,
    homeFouls: 1,
    awayTimeoutsRemaining: 0,
    homeTimeoutsRemaining: 0,
    manualOverrides: {
      period: "4",
      clock: "0:29",
      scoreDiff: "-2",
      possessionTeamId: ORL.teamId,
      ourTimeouts: "2",
      opponentTimeouts: "1",
      ourFouls: "4",
      opponentFouls: "3",
    },
  });
  const evaluation = evaluateLateGameStrategy(state);

  assert.equal(state.clock, "0:29");
  assert.equal(state.scoreDiff, -2);
  assert.equal(state.possessionTeamId, ORL.teamId);
  assert.equal(state.ourTimeouts, 2);
  assert.equal(state.foulsToGive, 0);
  assert.equal(evaluation.recommendation.call, "Need 2, prefer 3");
});
