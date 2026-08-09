import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSegmentStats } from "./segmentStats.js";

const AWAY = {
  teamId: 1,
  teamTricode: "AWY",
};

const HOME = {
  teamId: 2,
  teamTricode: "HME",
};

test("transition stats count fastbreak possessions once and include free throws", () => {
  const aggregated = aggregateSegmentStats({
    gameId: "0022500001",
    actions: [
      {
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clock: "PT11M00.00S",
        possession: AWAY.teamId,
        teamId: AWAY.teamId,
        actionType: "freethrow",
        shotResult: "Made",
        qualifiers: ["fastbreak"],
        personId: 101,
      },
      {
        actionNumber: 2,
        orderNumber: 2,
        period: 1,
        clock: "PT11M00.00S",
        possession: AWAY.teamId,
        teamId: AWAY.teamId,
        actionType: "freethrow",
        shotResult: "Made",
        qualifiers: ["fastbreak"],
        personId: 101,
      },
      {
        actionNumber: 3,
        orderNumber: 3,
        period: 1,
        clock: "PT10M45.00S",
        possession: HOME.teamId,
        teamId: HOME.teamId,
        actionType: "3pt",
        shotResult: "Made",
        qualifiers: ["fastbreak"],
        personId: 202,
      },
      {
        actionNumber: 4,
        orderNumber: 4,
        period: 1,
        clock: "PT10M20.00S",
        possession: AWAY.teamId,
        teamId: AWAY.teamId,
        actionType: "turnover",
        qualifiers: [],
        personId: 102,
      },
    ],
    segment: "all",
    minutesData: null,
    homeTeam: HOME,
    awayTeam: AWAY,
    basePlayers: [],
    currentPeriod: 1,
    currentClock: "PT10M20.00S",
    isLive: false,
  });

  assert.equal(aggregated.teamTotals[AWAY.teamId].transitionPoints, 2);
  assert.equal(aggregated.teamTotals[AWAY.teamId].transitionPossessions, 1);
  assert.equal(aggregated.teamTotals[HOME.teamId].transitionPoints, 3);
  assert.equal(aggregated.teamTotals[HOME.teamId].transitionPossessions, 1);
});

test("summer league segment stats credit made two-point free throws from score deltas", () => {
  const actions = [
    {
      actionNumber: 1,
      orderNumber: 1,
      period: 1,
      clock: "PT09M00.00S",
      teamId: AWAY.teamId,
      teamTricode: AWAY.teamTricode,
      actionType: "freethrow",
      subType: "1for2",
      shotResult: "Made",
      scoreAway: "2",
      scoreHome: "0",
      personId: 101,
    },
    {
      actionNumber: 2,
      orderNumber: 2,
      period: 1,
      clock: "PT00M00.00S",
      actionType: "period",
      scoreAway: "18",
      scoreHome: "27",
    },
    {
      actionNumber: 3,
      orderNumber: 3,
      period: 2,
      clock: "PT09M00.00S",
      teamId: HOME.teamId,
      teamTricode: HOME.teamTricode,
      actionType: "freethrow",
      subType: "1for2",
      shotResult: "Made",
      scoreAway: "18",
      scoreHome: "29",
      personId: 202,
    },
  ];

  const q1 = aggregateSegmentStats({
    gameId: "1522600001",
    actions,
    segment: "q1",
    minutesData: null,
    homeTeam: HOME,
    awayTeam: AWAY,
    basePlayers: [],
    currentPeriod: 4,
    currentClock: "PT00M00.00S",
    isLive: false,
  });
  assert.equal(q1.teamTotals[AWAY.teamId].points, 2);
  assert.equal(q1.playerMap.get(101).points, 2);
  assert.equal(q1.playerMap.get(101).freeThrowsMade, 1);
  assert.equal(q1.playerMap.get(101).freeThrowsAttempted, 1);

  const q2 = aggregateSegmentStats({
    gameId: "1522600001",
    actions,
    segment: "q2",
    minutesData: null,
    homeTeam: HOME,
    awayTeam: AWAY,
    basePlayers: [],
    currentPeriod: 4,
    currentClock: "PT00M00.00S",
    isLive: false,
  });
  assert.equal(q2.teamTotals[HOME.teamId].points, 2);
  assert.equal(q2.playerMap.get(202).points, 2);
});

test("modified free throw fallback credits one, two, and three point makes", () => {
  const aggregated = aggregateSegmentStats({
    gameId: "0022600001",
    actions: [
      {
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clock: "PT11M00.00S",
        teamId: AWAY.teamId,
        actionType: "freethrow",
        subType: "1pt",
        shotResult: "Made",
        personId: 101,
      },
      {
        actionNumber: 2,
        orderNumber: 2,
        period: 1,
        clock: "PT10M30.00S",
        teamId: AWAY.teamId,
        actionType: "freethrow",
        description: "Player Free Throw 2PT",
        shotResult: "Made",
        personId: 102,
      },
      {
        actionNumber: 3,
        orderNumber: 3,
        period: 1,
        clock: "PT10M00.00S",
        teamId: HOME.teamId,
        actionType: "freethrow",
        descriptor: "3 point free throw",
        shotResult: "Made",
        personId: 202,
      },
    ],
    segment: "q1",
    minutesData: null,
    homeTeam: HOME,
    awayTeam: AWAY,
    basePlayers: [],
    currentPeriod: 4,
    currentClock: "PT00M00.00S",
    isLive: false,
  });

  assert.equal(aggregated.teamTotals[AWAY.teamId].points, 3);
  assert.equal(aggregated.teamTotals[AWAY.teamId].freeThrowsMade, 2);
  assert.equal(aggregated.teamTotals[HOME.teamId].points, 3);
  assert.equal(aggregated.teamTotals[HOME.teamId].freeThrowsMade, 1);
  assert.equal(aggregated.playerMap.get(101).points, 1);
  assert.equal(aggregated.playerMap.get(102).points, 2);
  assert.equal(aggregated.playerMap.get(202).points, 3);
});

test("summer league lineup timing accepts non-ISO play-by-play clocks", () => {
  const aggregated = aggregateSegmentStats({
    gameId: "1522600001",
    actions: [
      {
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clock: "9:00",
        teamId: HOME.teamId,
        actionType: "substitution",
        subType: "out",
        personId: 201,
      },
    ],
    segment: "q1",
    minutesData: {
      periods: [
        {
          period: 1,
          stints: [
            {
              startClock: "10:00",
              endClock: "9:00",
              playersAway: [{ personId: 101 }],
              playersHome: [{ personId: 201 }],
            },
          ],
        },
      ],
    },
    homeTeam: HOME,
    awayTeam: AWAY,
    basePlayers: [],
    currentPeriod: 4,
    currentClock: "PT00M00.00S",
    isLive: false,
  });

  assert.equal(aggregated.playerMap.get(201).minutes, 60);
});
