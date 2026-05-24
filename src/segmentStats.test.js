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
