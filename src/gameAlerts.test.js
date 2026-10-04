import assert from "node:assert/strict";
import test from "node:test";
import { buildGameAlerts, selectPrimaryGameAlert } from "./gameAlerts.js";

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
  assert.ok(alerts.some((alert) => alert.title === "Nets are on a 8-0 run over the last 1:03"));
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
    "Nets are on a 8-0 run over the last 1:20",
    "Nets are on a 14-0 run over the last 2:45",
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

  const shareAlert = alerts.find((alert) => alert.title.includes("John Ukomadu has contributed to"));
  assert.ok(shareAlert);
  assert.equal(
    shareAlert.title,
    "John Ukomadu has contributed to 83.3% of the team's points so far in Q1",
  );
  assert.equal(shareAlert.detail, "2 Pts, 3 Ast (8 Pts via Ast)");
  assert.equal(alerts.filter((alert) => alert.title.includes("John Ukomadu has contributed to")).length, 1);
});

test("buildGameAlerts adds bounded team trend alerts at period checkpoints", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    period: 2,
    gameClock: "PT12M00.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT11M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "2", scoreHome: "0" }),
      scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", clock: "PT10M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "5", scoreHome: "0" }),
      scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", clock: "PT09M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "8", scoreHome: "0" }),
      scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT08M40.00S", scoreAway: "10", scoreHome: "0" }),
      scoringAction({ actionNumber: 5, orderNumber: 5, clock: "PT07M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "12", scoreHome: "0" }),
      scoringAction({ actionNumber: 6, orderNumber: 6, actionType: "3pt", clock: "PT06M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "15", scoreHome: "0" }),
      scoringAction({ actionNumber: 7, orderNumber: 7, actionType: "3pt", clock: "PT05M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "18", scoreHome: "0" }),
      scoringAction({ actionNumber: 8, orderNumber: 8, actionType: "3pt", clock: "PT04M40.00S", scoreAway: "21", scoreHome: "0" }),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  assert.ok(alerts.some((alert) => (
    alert.category === "Team Trend" &&
    alert.title === "Nets scored 76.2% of their points from assisted shots through the end of Q1" &&
    alert.detail === "Assisted: 6/6 FG (16 Pts), Unassisted: 2/2 FG (5 Pts), FT: 0/0 (0 Pts)"
  )));
});

test("buildGameAlerts adds assisted, unassisted, and free-throw detail to assisted-shot trends", () => {
  const actions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT11M30.00S", assistPersonId: 101, scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", clock: "PT10M30.00S", assistPersonId: 101, scoreAway: "5", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, clock: "PT09M30.00S", scoreAway: "7", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT08M30.00S", scoreAway: "9", scoreHome: "0" }),
    scoringAction({ actionNumber: 5, orderNumber: 5, clock: "PT07M30.00S", scoreAway: "11", scoreHome: "0" }),
    scoringAction({ actionNumber: 6, orderNumber: 6, clock: "PT06M30.00S", scoreAway: "13", scoreHome: "0" }),
    scoringAction({ actionNumber: 7, orderNumber: 7, clock: "PT05M30.00S", scoreAway: "15", scoreHome: "0" }),
    scoringAction({ actionNumber: 8, orderNumber: 8, actionType: "freethrow", clock: "PT04M30.00S", scoreAway: "16", scoreHome: "0" }),
    scoringAction({ actionNumber: 9, orderNumber: 9, actionType: "freethrow", clock: "PT03M30.00S", scoreAway: "17", scoreHome: "0" }),
    scoringAction({ actionNumber: 10, orderNumber: 10, actionType: "freethrow", clock: "PT02M30.00S", scoreAway: "18", scoreHome: "0" }),
    scoringAction({ actionNumber: 11, orderNumber: 11, actionType: "freethrow", shotResult: "Missed", clock: "PT01M30.00S", scoreAway: "18", scoreHome: "0" }),
  ];

  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 2,
      gameClock: "PT12M00.00S",
      playByPlayActions: actions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  const assistedTrend = alerts.find((alert) => (
    alert.category === "Team Trend" &&
    alert.title === "Nets scored just 27.8% of their points from assisted shots through the end of Q1"
  ));
  assert.ok(assistedTrend);
  assert.equal(
    assistedTrend.detail,
    "Assisted: 2/2 FG (5 Pts), Unassisted: 5/5 FG (10 Pts), FT: 3/4 (3 Pts)",
  );
});

test("buildGameAlerts labels three-point attempt volume with 3FG", () => {
  let actionNumber = 0;
  let scoreAway = 0;
  const made = (actionType, points, assist = false) => {
    actionNumber += 1;
    scoreAway += points;
    return scoringAction({
      actionNumber,
      orderNumber: actionNumber,
      actionType,
      clock: `PT${String(Math.max(1, 12 - actionNumber)).padStart(2, "0")}M00.00S`,
      scoreAway: String(scoreAway),
      scoreHome: "0",
      ...(assist ? { assistPersonId: 101, assistPlayerNameI: "J. Ukomadu" } : {}),
    });
  };
  const missed = (actionType) => {
    actionNumber += 1;
    return scoringAction({
      actionNumber,
      orderNumber: actionNumber,
      actionType,
      shotResult: "Missed",
      clock: `PT00M${String(Math.max(1, 60 - actionNumber)).padStart(2, "0")}.00S`,
      scoreAway: String(scoreAway),
      scoreHome: "0",
    });
  };
  const actions = [
    made("3pt", 3, true),
    made("3pt", 3, true),
    made("3pt", 3),
    ...Array.from({ length: 8 }, (_, index) => made("2pt", 2, index < 3)),
    ...Array.from({ length: 7 }, () => missed("3pt")),
    ...Array.from({ length: 4 }, () => missed("2pt")),
  ];

  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 2,
      gameClock: "PT12M00.00S",
      playByPlayActions: actions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  assert.ok(alerts.some((alert) => (
    alert.category === "Team Trend" &&
    alert.title === "Nets took 45.5% of their shots from three in Q1 (10/22 3FG)"
  )));
});

test("buildGameAlerts omits just before zero-percent team trend alerts", () => {
  const noAssistedPointsActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, actionType: "3pt", clock: "PT11M00.00S", scoreAway: "3", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", clock: "PT10M00.00S", scoreAway: "6", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", clock: "PT09M00.00S", scoreAway: "9", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, actionType: "3pt", clock: "PT08M00.00S", scoreAway: "12", scoreHome: "0" }),
  ];
  const missedThreesActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT11M00.00S", scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, clock: "PT10M00.00S", scoreAway: "4", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, clock: "PT09M00.00S", scoreAway: "6", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT08M00.00S", scoreAway: "8", scoreHome: "0" }),
    scoringAction({ actionNumber: 5, orderNumber: 5, clock: "PT07M00.00S", scoreAway: "10", scoreHome: "0" }),
    ...Array.from({ length: 7 }, (_, index) => scoringAction({
      actionNumber: 6 + index,
      orderNumber: 6 + index,
      shotResult: "Missed",
      clock: `PT0${6 - Math.floor(index / 2)}M${String(40 - ((index % 2) * 20)).padStart(2, "0")}.00S`,
      scoreAway: "10",
      scoreHome: "0",
    })),
    ...Array.from({ length: 9 }, (_, index) => scoringAction({
      actionNumber: 13 + index,
      orderNumber: 13 + index,
      actionType: "3pt",
      shotResult: "Missed",
      clock: `PT0${3 - Math.floor(index / 3)}M${String(50 - ((index % 3) * 15)).padStart(2, "0")}.00S`,
      scoreAway: "10",
      scoreHome: "0",
    })),
  ];

  const noAssistedAlerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 2,
      gameClock: "PT12M00.00S",
      playByPlayActions: noAssistedPointsActions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });
  const missedThreeAlerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 2,
      gameClock: "PT12M00.00S",
      playByPlayActions: missedThreesActions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  assert.ok(noAssistedAlerts.some((alert) => (
    alert.title === "Nets scored 0% of their points from assisted shots through the end of Q1"
  )));
  assert.ok(missedThreeAlerts.some((alert) => (
    alert.title === "Nets shot 0% (0/9 3FG) from three in Q1"
  )));
  assert.ok(![...noAssistedAlerts, ...missedThreeAlerts].some((alert) => /just 0%/.test(alert.title)));
});

test("buildGameAlerts formats run ranges with compact period labels", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    period: 2,
    gameClock: "PT07M00.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT01M15.00S", teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", scoreAway: "0", scoreHome: "2" }),
      scoringAction({ actionNumber: 2, orderNumber: 2, period: 2, clock: "PT09M48.00S", teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", scoreAway: "0", scoreHome: "4" }),
      scoringAction({ actionNumber: 3, orderNumber: 3, period: 2, clock: "PT08M40.00S", teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", scoreAway: "0", scoreHome: "6" }),
      scoringAction({ actionNumber: 4, orderNumber: 4, period: 2, clock: "PT07M26.00S", teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", scoreAway: "0", scoreHome: "8" }),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 201, firstName: "Steven", familyName: "Ashworth", teamId: HOME.teamId }],
  });

  const runAlert = alerts.find((alert) => alert.category === "Run" && alert.title === "Thunder are on a 8-0 run over the last 5:49");
  assert.ok(runAlert);
  assert.equal(runAlert.detail, "Q1 1:15 to Q2 7:26");
});

test("buildGameAlerts never carries a run across halftime", () => {
  const firstHalfActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT02M00.00S", scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, period: 2, clock: "PT10M00.00S", scoreAway: "4", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, period: 2, clock: "PT09M30.00S", scoreAway: "6", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, period: 2, clock: "PT09M00.00S", scoreAway: "8", scoreHome: "0" }),
  ];
  const halftimeCrossingActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, period: 2, clock: "PT01M00.00S", scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, period: 3, clock: "PT10M00.00S", scoreAway: "4", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, period: 3, clock: "PT09M30.00S", scoreAway: "6", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, period: 3, clock: "PT09M00.00S", scoreAway: "8", scoreHome: "0" }),
  ];

  const build = (playByPlayActions, period) => buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period,
      gameClock: "PT09M00.00S",
      playByPlayActions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  assert.ok(build(firstHalfActions, 2).some((alert) => alert.category === "Run" && alert.title.includes("8-0 run")));
  assert.ok(!build(halftimeCrossingActions, 3).some((alert) => alert.category === "Run"));
});

test("a completed Q2 summary is primary until Q3 starts", () => {
  const halftimeActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT08M00.00S", scoreAway: "2", scoreHome: "0" }),
    { actionNumber: 2, orderNumber: 2, actionType: "period", subType: "end", period: 1, clock: "PT00M00.00S", scoreAway: "2", scoreHome: "0" },
    scoringAction({ actionNumber: 3, orderNumber: 3, period: 2, clock: "PT08M00.00S", scoreAway: "4", scoreHome: "0" }),
    { actionNumber: 4, orderNumber: 4, actionType: "period", subType: "end", period: 2, clock: "PT00M00.00S", scoreAway: "4", scoreHome: "0" },
  ];
  const build = (playByPlayActions, period, gameClock) => buildGameAlerts({
    game: {
      gameId: "0012600009",
      gameStatus: 2,
      period,
      gameClock,
      playByPlayActions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  const halftimeAlerts = build(halftimeActions, 2, "PT08M51.00S");
  const halftimeSummary = halftimeAlerts.find((alert) => alert.category === "Halftime");
  assert.ok(halftimeSummary);
  assert.equal(halftimeSummary.isPrimary, true);
  assert.equal(selectPrimaryGameAlert([...halftimeAlerts].reverse())?.id, halftimeSummary.id);

  const thirdQuarterAlerts = build([
    ...halftimeActions,
    { actionNumber: 5, orderNumber: 5, actionType: "period", subType: "start", period: 3, clock: "PT12M00.00S", scoreAway: "4", scoreHome: "0" },
  ], 3, "PT12M00.00S");
  assert.equal(thirdQuarterAlerts.find((alert) => alert.category === "Halftime")?.isPrimary, false);
});

test("a completed game ends with a primary full-game recap", () => {
  const actions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT10M00.00S", scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, period: 2, clock: "PT08M00.00S", scoreAway: "4", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, period: 3, clock: "PT06M00.00S", teamId: HOME.teamId, personId: 201, playerName: "Home Leader", scoreAway: "4", scoreHome: "2" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, period: 4, clock: "PT02M00.00S", actionType: "3pt", scoreAway: "7", scoreHome: "2" }),
    scoringAction({ actionNumber: 5, orderNumber: 5, period: 4, clock: "PT01M00.00S", teamId: HOME.teamId, personId: 201, playerName: "Home Leader", scoreAway: "7", scoreHome: "4" }),
    { actionNumber: 6, orderNumber: 6, actionType: "period", subType: "end", period: 4, clock: "PT00M00.00S", scoreAway: "7", scoreHome: "4" },
  ];
  const alerts = buildGameAlerts({
    game: { gameId: "0022600001", gameStatus: 3, period: 4, gameClock: "PT00M00.00S", playByPlayActions: actions },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId },
      { personId: 201, firstName: "Home", familyName: "Leader", teamId: HOME.teamId },
    ],
  });
  const recap = alerts.find((alert) => alert.category === "Final");
  assert.ok(recap);
  assert.equal(recap.title, "Nets defeated Thunder, 7-4");
  assert.match(recap.detail, /John Ukomadu leads the Nets/);
  assert.equal(selectPrimaryGameAlert(alerts)?.id, "final-game-recap");
  assert.equal(alerts.at(-1)?.id, "final-game-recap");
});

test("every timeout creates an alert with recent game context", () => {
  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 1,
      gameClock: "PT07M30.00S",
      playByPlayActions: [
        scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT09M30.00S", scoreAway: "2", scoreHome: "0" }),
        scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", period: 1, clock: "PT08M45.00S", scoreAway: "5", scoreHome: "0" }),
        scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", period: 1, clock: "PT08M00.00S", scoreAway: "8", scoreHome: "0" }),
        { actionNumber: 4, orderNumber: 4, actionType: "timeout", subType: "regular", period: 1, clock: "PT07M58.00S", teamId: HOME.teamId, scoreAway: "8", scoreHome: "0" },
        { actionNumber: 5, orderNumber: 5, actionType: "timeout", subType: "official", period: 1, clock: "PT07M30.00S", scoreAway: "8", scoreHome: "0" },
      ],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [{ personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId }],
  });

  const timeoutAlerts = alerts.filter((alert) => alert.category === "Timeout");
  assert.equal(timeoutAlerts.length, 2);
  assert.equal(timeoutAlerts[0].title, "Thunder timeout after Nets won the recent stretch 8-0");
  assert.match(timeoutAlerts[0].detail, /Nets lead Thunder 8-0/);
  assert.ok(timeoutAlerts[1].title.startsWith("Timeout"));
  assert.ok(timeoutAlerts.every((alert) => alert.detail));
});

test("empty-possession alerts update within a streak and reset for a new streak", () => {
  let order = 0;
  const action = (teamId, actionType, shotResult = undefined) => ({
    actionNumber: ++order,
    orderNumber: order,
    period: 1,
    clock: `PT${String(12 - Math.floor(order / 2)).padStart(2, "0")}M00.00S`,
    possession: teamId,
    teamId,
    actionType,
    shotResult,
    personId: teamId === AWAY.teamId ? 101 : 201,
  });
  const actions = [];
  const emptyAwayPossession = (type = "turnover") => {
    actions.push(action(AWAY.teamId, type, type === "2pt" ? "Missed" : undefined));
    actions.push(action(HOME.teamId, "2pt", "Made"));
  };
  emptyAwayPossession("2pt");
  emptyAwayPossession();
  emptyAwayPossession("2pt");
  emptyAwayPossession();
  actions.push(action(AWAY.teamId, "2pt", "Made"));
  actions.push(action(HOME.teamId, "turnover"));
  emptyAwayPossession();
  emptyAwayPossession("2pt");
  emptyAwayPossession();

  const alerts = buildGameAlerts({
    game: { gameId: "0022600001", gameStatus: 2, period: 1, gameClock: "PT03M00.00S", playByPlayActions: actions },
    awayTeam: AWAY,
    homeTeam: HOME,
  });
  const emptyAlerts = alerts.filter((alert) => alert.category === "Empty Possessions" && alert.teamId === AWAY.teamId);
  assert.equal(emptyAlerts.length, 2);
  assert.ok(emptyAlerts.some((alert) => alert.title.includes("4 consecutive possessions")));
  assert.ok(emptyAlerts.some((alert) => alert.title.includes("3 consecutive possessions")));
});

test("Kill alerts fire for each completed group of three defensive stops", () => {
  const actions = [];
  let order = 0;
  for (let stop = 0; stop < 6; stop += 1) {
    actions.push({ actionNumber: ++order, orderNumber: order, period: 1, clock: `PT0${9 - stop}M30.00S`, possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "turnover", personId: 101 });
    actions.push({ actionNumber: ++order, orderNumber: order, period: 1, clock: `PT0${9 - stop}M00.00S`, possession: HOME.teamId, teamId: HOME.teamId, actionType: "2pt", shotResult: "Made", personId: 201 });
  }
  const alerts = buildGameAlerts({
    game: { gameId: "0022600001", gameStatus: 2, period: 1, gameClock: "PT03M00.00S", playByPlayActions: actions },
    awayTeam: AWAY,
    homeTeam: HOME,
  });
  assert.deepEqual(
    alerts.filter((alert) => alert.category === "Kill").map((alert) => alert.title),
    ["Thunder just completed its 1st Kill of the game", "Thunder just completed its 2nd Kill of the game"],
  );
});

test("second-chance pressure aggregates offensive rebounds and resulting points", () => {
  const actions = [
    { actionNumber: 1, orderNumber: 1, period: 1, clock: "PT09M00.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "2pt", shotResult: "Missed", personId: 101 },
    { actionNumber: 2, orderNumber: 2, period: 1, clock: "PT08M58.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "rebound", subType: "offensive", personId: 101 },
    { actionNumber: 3, orderNumber: 3, period: 1, clock: "PT08M50.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "2pt", shotResult: "Made", personId: 101 },
    { actionNumber: 4, orderNumber: 4, period: 1, clock: "PT08M30.00S", possession: HOME.teamId, teamId: HOME.teamId, actionType: "turnover", personId: 201 },
    { actionNumber: 5, orderNumber: 5, period: 1, clock: "PT08M00.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "3pt", shotResult: "Missed", personId: 101 },
    { actionNumber: 6, orderNumber: 6, period: 1, clock: "PT07M58.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "rebound", subType: "offensive", personId: 101 },
    { actionNumber: 7, orderNumber: 7, period: 1, clock: "PT07M50.00S", possession: AWAY.teamId, teamId: AWAY.teamId, actionType: "3pt", shotResult: "Made", personId: 101 },
    { actionNumber: 8, orderNumber: 8, period: 1, clock: "PT07M30.00S", possession: HOME.teamId, teamId: HOME.teamId, actionType: "turnover", personId: 201 },
  ];
  const alert = buildGameAlerts({
    game: { gameId: "0022600001", gameStatus: 2, period: 1, gameClock: "PT07M30.00S", playByPlayActions: actions },
    awayTeam: AWAY,
    homeTeam: HOME,
  }).find((candidate) => candidate.category === "Second Chance");
  assert.equal(alert?.title, "Nets have 5 second-chance points in Q1");
  assert.equal(alert?.detail, "2 offensive rebounds created 2 scoring possessions.");
});

test("bonus pressure matches the yellow foul indicator thresholds", () => {
  const foul = (actionNumber, teamId, clock) => ({ actionNumber, orderNumber: actionNumber, period: 1, clock, teamId, actionType: "foul", subType: "personal", personId: teamId === AWAY.teamId ? 101 : 201 });
  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 1,
      gameClock: "PT01M30.00S",
      playByPlayActions: [
        foul(1, AWAY.teamId, "PT08M00.00S"), foul(2, AWAY.teamId, "PT06M00.00S"),
        foul(3, AWAY.teamId, "PT04M00.00S"), foul(4, AWAY.teamId, "PT03M00.00S"),
        foul(5, HOME.teamId, "PT01M30.00S"),
      ],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
  });
  const pressure = alerts.filter((alert) => alert.category === "Bonus Pressure");
  assert.equal(pressure.length, 2);
  const awayPressure = pressure.find((alert) => alert.teamId === AWAY.teamId);
  const homePressure = pressure.find((alert) => alert.teamId === HOME.teamId);
  assert.equal(awayPressure?.title, "Nets’ next foul will put Thunder in the penalty");
  assert.match(awayPressure?.detail, /4th team foul/);
  assert.equal(homePressure?.title, "Thunder have one foul to give");
  assert.match(homePressure?.detail, /first team foul inside the final 2:00/);
});

test("bonus pressure does not call a fourth team foul inside 2:00 a foul to give", () => {
  const foul = (actionNumber, clock) => ({
    actionNumber,
    orderNumber: actionNumber,
    period: 4,
    clock,
    teamId: AWAY.teamId,
    actionType: "foul",
    subType: "personal",
    personId: 101,
  });
  const alert = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 4,
      gameClock: "PT01M30.00S",
      playByPlayActions: [
        foul(1, "PT08M00.00S"),
        foul(2, "PT06M00.00S"),
        foul(3, "PT04M00.00S"),
        foul(4, "PT01M30.00S"),
      ],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
  }).find((candidate) => candidate.category === "Bonus Pressure");

  assert.equal(alert?.title, "Nets’ next foul will put Thunder in the penalty");
  assert.doesNotMatch(alert?.title || "", /foul to give/i);
});

test("buildGameAlerts keeps late-quarter rebound alerts before period-end alerts", () => {
  const game = {
    gameId: "0022600001",
    gameStatus: 2,
    period: 2,
    gameClock: "PT12M00.00S",
    playByPlayActions: [
      scoringAction({ actionNumber: 1, orderNumber: 1, period: 1, clock: "PT08M00.00S", teamId: HOME.teamId, personId: 201, playerName: "Steven Ashworth", scoreAway: "0", scoreHome: "2" }),
      ...[
        "PT07M00.00S",
        "PT05M00.00S",
        "PT03M00.00S",
        "PT01M00.00S",
        "PT00M25.00S",
      ].map((clock, index) => ({
        actionNumber: 2 + index,
        orderNumber: 2 + index,
        actionType: "rebound",
        period: 1,
        clock,
        teamId: HOME.teamId,
        personId: 202,
        playerName: "Julian Champagnie",
      })),
    ],
  };

  const alerts = buildGameAlerts({
    game,
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 201, firstName: "Steven", familyName: "Ashworth", teamId: HOME.teamId },
      { personId: 202, firstName: "Julian", familyName: "Champagnie", teamId: HOME.teamId },
    ],
  });

  const reboundIndex = alerts.findIndex((alert) => alert.title === "Julian Champagnie has gathered 5 Reb in Q1");
  const periodEndIndex = alerts.findIndex((alert) => alert.category === "Quarter" && alert.timeLabel === "Q1 0:00");
  assert.notEqual(reboundIndex, -1);
  assert.notEqual(periodEndIndex, -1);
  assert.ok(reboundIndex < periodEndIndex);
});

test("buildGameAlerts includes current stats for approaching triple-double alerts", () => {
  let actionNumber = 0;
  let scoreAway = 0;
  const nextActionNumber = () => {
    actionNumber += 1;
    return actionNumber;
  };
  const rebounds = Array.from({ length: 9 }, (_, index) => {
    const number = nextActionNumber();
    return {
      actionNumber: number,
      orderNumber: number,
      actionType: "rebound",
      period: 4,
      clock: `PT0${9 - Math.floor(index / 2)}M${String(50 - ((index % 2) * 20)).padStart(2, "0")}.00S`,
      teamId: AWAY.teamId,
      personId: 101,
      playerName: "Chris Livingston",
    };
  });
  const assists = Array.from({ length: 9 }, (_, index) => {
    const number = nextActionNumber();
    scoreAway += 2;
    return scoringAction({
      actionNumber: number,
      orderNumber: number,
      period: 4,
      clock: `PT0${5 - Math.floor(index / 2)}M${String(50 - ((index % 2) * 20)).padStart(2, "0")}.00S`,
      personId: 102,
      playerName: "Teammate Scorer",
      assistPersonId: 101,
      assistPlayerNameI: "C. Livingston",
      scoreAway: String(scoreAway),
      scoreHome: "0",
    });
  });
  const points = Array.from({ length: 5 }, (_, index) => {
    const number = nextActionNumber();
    scoreAway += 2;
    return scoringAction({
      actionNumber: number,
      orderNumber: number,
      period: 4,
      clock: `PT02M${String(50 - (index * 20)).padStart(2, "0")}.00S`,
      personId: 101,
      playerName: "Chris Livingston",
      scoreAway: String(scoreAway),
      scoreHome: "0",
    });
  });

  const alerts = buildGameAlerts({
    game: {
      gameId: "2042500211",
      gameStatus: 2,
      period: 4,
      gameClock: "PT02M21.00S",
      playByPlayActions: [...rebounds, ...assists, ...points],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "Chris", familyName: "Livingston", teamId: AWAY.teamId },
      { personId: 102, firstName: "Teammate", familyName: "Scorer", teamId: AWAY.teamId },
    ],
  });

  assert.ok(alerts.some((alert) => (
    alert.category === "Milestone" &&
    /^Chris Livingston is approaching a triple-double \(\d+ Pts, 9 Reb, 9 Ast\)$/.test(alert.title)
  )));
});

test("buildGameAlerts caps full-game output while preserving checkpoint trends", () => {
  const assistedScoringActions = [
    scoringAction({ actionNumber: 1, orderNumber: 1, clock: "PT11M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "2", scoreHome: "0" }),
    scoringAction({ actionNumber: 2, orderNumber: 2, actionType: "3pt", clock: "PT10M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "5", scoreHome: "0" }),
    scoringAction({ actionNumber: 3, orderNumber: 3, actionType: "3pt", clock: "PT09M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "8", scoreHome: "0" }),
    scoringAction({ actionNumber: 4, orderNumber: 4, clock: "PT08M40.00S", scoreAway: "10", scoreHome: "0" }),
    scoringAction({ actionNumber: 5, orderNumber: 5, clock: "PT07M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "12", scoreHome: "0" }),
    scoringAction({ actionNumber: 6, orderNumber: 6, actionType: "3pt", clock: "PT06M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "15", scoreHome: "0" }),
    scoringAction({ actionNumber: 7, orderNumber: 7, actionType: "3pt", clock: "PT05M40.00S", assistPersonId: 101, assistPlayerNameI: "J. Ukomadu", scoreAway: "18", scoreHome: "0" }),
    scoringAction({ actionNumber: 8, orderNumber: 8, actionType: "3pt", clock: "PT04M40.00S", scoreAway: "21", scoreHome: "0" }),
  ];
  const foulActions = Array.from({ length: 92 }, (_, index) => ({
    actionNumber: 9 + index,
    orderNumber: 9 + index,
    actionType: "foul",
    subType: "personal",
    period: 1,
    clock: `PT${String(Math.max(0, 4 - Math.floor(index / 20))).padStart(2, "0")}M${String(50 - (index % 20)).padStart(2, "0")}.00S`,
    teamId: AWAY.teamId,
    personId: 104,
    playerName: "Foul Player",
  }));

  const alerts = buildGameAlerts({
    game: {
      gameId: "0022600001",
      gameStatus: 2,
      period: 2,
      gameClock: "PT12M00.00S",
      playByPlayActions: [...assistedScoringActions, ...foulActions],
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "John", familyName: "Ukomadu", teamId: AWAY.teamId },
      { personId: 104, firstName: "Foul", familyName: "Player", teamId: AWAY.teamId },
    ],
  });

  assert.equal(alerts.length, 75);
  assert.ok(alerts.some((alert) => alert.title === "The Nets scored the first points of the game"));
  assert.ok(alerts.some((alert) => alert.title === "Nets scored 76.2% of their points from assisted shots through the end of Q1"));
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

  assert.ok(alerts.some((alert) => alert.title === "Dain Dainja has totaled 3 Blk"));
  assert.ok(alerts.some((alert) => alert.title === "Dion Brown has committed 4 PF"));
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

  assert.ok(alerts.some((alert) => alert.title === "Dain Dainja has totaled 3 Blk"));
  assert.ok(alerts.some((alert) => alert.title === "Aaron Scott has tallied 3 Stl"));
});

test("buildGameAlerts counts paired linked and explicit steals only once", () => {
  const pairedStealActions = [
    { period: 1, clock: "PT08M21.00S", turnoverActionNumber: 1, stealActionNumber: 2 },
    { period: 2, clock: "PT09M52.00S", turnoverActionNumber: 3, stealActionNumber: 4 },
  ].flatMap(({ period, clock, turnoverActionNumber, stealActionNumber }) => ([
    {
      actionNumber: turnoverActionNumber,
      orderNumber: turnoverActionNumber,
      actionType: "turnover",
      period,
      clock,
      teamId: HOME.teamId,
      personId: 201,
      stealPersonId: 101,
      stealPlayerNameI: "A. Defender",
    },
    {
      actionNumber: stealActionNumber,
      orderNumber: stealActionNumber,
      actionType: "steal",
      period,
      clock,
      teamId: AWAY.teamId,
      personId: 101,
      playerName: "Actual Defender",
    },
  ]));

  const alerts = buildGameAlerts({
    game: {
      gameId: "0012600009",
      gameStatus: 2,
      period: 2,
      gameClock: "PT09M00.00S",
      playByPlayActions: pairedStealActions,
    },
    awayTeam: AWAY,
    homeTeam: HOME,
    basePlayers: [
      { personId: 101, firstName: "Actual", familyName: "Defender", teamId: AWAY.teamId },
    ],
  });

  assert.equal(alerts.filter((alert) => alert.title === "Actual Defender has tallied 3 Stl").length, 0);
});
