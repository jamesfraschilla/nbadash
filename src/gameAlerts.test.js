import assert from "node:assert/strict";
import test from "node:test";
import { buildGameAlerts } from "./gameAlerts.js";

const AWAY = { teamId: "1", teamName: "Nets", teamTricode: "BKN" };
const HOME = { teamId: "2", teamName: "Thunder", teamTricode: "OKC" };

function scoringAction(overrides) {
  return {
    actionType: "2pt",
    shotResult: "Made",
    period: 1,
    clock: "PT09M00.00S",
    personId: 101,
    playerName: "John Ukomadu",
    teamId: AWAY.teamId,
    scoreAway: "0",
    scoreHome: "0",
    ...overrides,
  };
}

test("buildGameAlerts creates first-score and scoring-run alerts from loaded play-by-play", () => {
  const game = {
    gameId: "1522600074",
    gameStatus: 2,
    period: 1,
    gameClock: "PT06M30.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT09M40.00S", scoreAway: "2", scoreHome: "0" }),
      scoringAction({ actionNumber: 2, orderNumber: 2, teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", clock: "PT09M10.00S", scoreAway: "2", scoreHome: "2" }),
      scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", clock: "PT08M01.00S", scoreAway: "5", scoreHome: "2" }),
      scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT07M30.00S", scoreAway: "7", scoreHome: "2" }),
      scoringAction({ actionNumber: 5, orderNumber: 5, actionType: "3pt", clock: "PT06M58.00S", scoreAway: "10", scoreHome: "2" }),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  assert.ok(alerts.some((alert) => alert.title === "The Nets scored the first points of the game"));
  assert.ok(alerts.some((alert) => alert.title === "Nets are on a 8-0 run"));
});

test("buildGameAlerts throttles consecutive alerts for the same scoring run", () => {
  const game = {
    gameId: "1522600074",
    gameStatus: 2,
    period: 1,
    gameClock: "PT04M30.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT09M40.00S", scoreAway: "2", scoreHome: "0" }),
      scoringAction({ actionNumber: 2, orderNumber: 2, teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", clock: "PT09M10.00S", scoreAway: "2", scoreHome: "2" }),
      scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", clock: "PT08M40.00S", scoreAway: "5", scoreHome: "2" }),
      scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT08M00.00S", scoreAway: "7", scoreHome: "2" }),
      scoringAction({ actionNumber: 5, orderNumber: 5, actionType: "3pt", clock: "PT07M20.00S", scoreAway: "10", scoreHome: "2" }),
      scoringAction({ actionNumber: 6, orderNumber: 6, clock: "PT06M45.00S", scoreAway: "12", scoreHome: "2" }),
      scoringAction({ actionNumber: 7, orderNumber: 7, clock: "PT06M20.00S", scoreAway: "14", scoreHome: "2" }),
      scoringAction({ actionNumber: 8, orderNumber: 8, clock: "PT05M55.00S", scoreAway: "16", scoreHome: "2" }),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  const netsRunAlerts = alerts.filter((alert) => alert.category === "Run" && alert.teamCode === "BKN");
  assert.deepEqual(netsRunAlerts.map((alert) => alert.title), [
    "Nets are on a 8-0 run",
    "Nets are on a 14-0 run",
  ]);
});

test("buildGameAlerts reports player-created share with assisted points", () => {
  const game = {
    gameId: "1522600074",
    gameStatus: 2,
    period: 1,
    gameClock: "PT05M00.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT09M40.00S", scoreAway: "2", scoreHome: "0" }),
      scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", clock: "PT08M30.00S", personId: 102, playerName: "Dion Brown", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "5", scoreHome: "0" }),
      scoringAction({ actionNumber: 3, orderNumber: 3, clock: "PT07M45.00S", personId: 103, playerName: "Nolan Hickman", scoreAway: "7", scoreHome: "0" }),
      scoringAction({ actionNumber: 4, orderNumber: 4, actionType: "3pt", clock: "PT07M20.00S", personId: 102, playerName: "Dion Brown", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "10", scoreHome: "0" }),
      scoringAction({ actionNumber: 5, orderNumber: 5, teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", clock: "PT06M30.00S", scoreAway: "10", scoreHome: "2" }),
      scoringAction({ actionNumber: 6, orderNumber: 6, clock: "PT05M50.00S", personId: 103, playerName: "Nolan Hickman", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "12", scoreHome: "2" }),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId },
      { personId: 102, firstName: "Dion", familyName: "Brown", teamId: AWAY.teamId },
    ],
  });

  const shareAlert = alerts.find((alert) => alert.title.includes("John Ukomadu contributed to"));
  assert.ok(shareAlert);
  assert.equal(shareAlert.detail, "(2 points, 3 assists, 8 points created from assists)");
  assert.equal(alerts.filter((alert) => alert.title.includes("John Ukomadu contributed to")).length, 1);
});

test("buildGameAlerts reports observed defensive and foul milestones", () => {
  const blockActions = [1, 2, 3].map((count) => ({
    actionNumber: count,
    orderNumber: count,
    actionType: "block",
    period: 1,
    clock: `PT0${9 - count}M00.00S`,
    teamId: HOME.teamId,
    personId: 201,
    playerName: "Dain Dainja",
  }));
  const foulActions = [4, 5, 6, 7].map((actionNumber, index) => ({
    actionNumber,
    orderNumber: actionNumber,
    actionType: "foul",
    period: 1,
    clock: `PT0${5 - index}M00.00S`,
    teamId: AWAY.teamId,
    personId: 101,
    playerName: "Dion Brown",
  }));

  const alerts = buildGameAlerts({
    game: {
      gameId: "1522600074",
      gameStatus: 2,
      period: 1,
      gameClock: "PT03M00.00S",
      playByPlayActions: [...blockActions, ...foulActions],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "Dion", familyName: "Brown", teamId: AWAY.teamId },
      { personId: 201, firstName: "Dain", familyName: "Dainja", teamId: HOME.teamId },
    ],
  });

  assert.ok(alerts.some((alert) => alert.title === "Dain Dainja has totaled 3 blocks"));
  assert.ok(alerts.some((alert) => alert.title === "Dion Brown has committed 4 personal fouls"));
});

test("buildGameAlerts credits linked defensive players on shot and turnover events", () => {
  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 1,
      gameClock: "PT06M00.00S",
      playByPlayActions: [
        ...[1, 2, 3].map((actionNumber) => ({
          actionNumber,
          orderNumber: actionNumber,
          actionType: "2pt",
          shotResult: "Missed",
          period: 1,
          clock: `PT0${9 - actionNumber}M00.00S`,
          teamId: AWAY.teamId,
          personId: 101,
          playerName: "Dion Brown",
          blockPersonId: 201,
          blockPlayerNameI: "D. Dainja",
        })),
        ...[4, 5, 6].map((actionNumber, index) => ({
          actionNumber,
          orderNumber: actionNumber,
          actionType: "turnover",
          period: 1,
          clock: `PT0${5 - index}M00.00S`,
          teamId: AWAY.teamId,
          personId: 101,
          playerName: "Dion Brown",
          stealPersonId: 202,
          stealPlayerNameI: "A. Scott",
        })),
      ],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 201, firstName: "Dain", familyName: "Dainja", teamId: HOME.teamId },
      { personId: 202, firstName: "Aaron", familyName: "Scott", teamId: HOME.teamId },
    ],
  });

  assert.ok(alerts.some((alert) => alert.title === "Dain Dainja has totaled 3 blocks"));
  assert.ok(alerts.some((alert) => alert.title === "Aaron Scott has tallied 3 steals"));
});
