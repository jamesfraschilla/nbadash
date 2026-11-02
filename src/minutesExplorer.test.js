import test from "node:test";
import assert from "node:assert/strict";
import { buildMinutesExplorer, buildCombos, comboMetrics, playerTimeline, clockSeconds, durationLabel, defaultMinutesVantage } from "./minutesExplorer.js";
import { minutesFixture } from "../tests/fixtures/minutesExplorer.js";

test("Washington is the default vantage at home or away; other games retain away default", () => {
  assert.equal(defaultMinutesVantage({ homeTeam: { teamTricode: "WAS" } }), "home");
  assert.equal(defaultMinutesVantage({ awayTeam: { teamTricode: "WAS" } }), "away");
  assert.equal(defaultMinutesVantage({ homeTeam: { teamId: 1610612764 } }), "home");
  assert.equal(defaultMinutesVantage({ homeTeam: { teamTricode: "NOP" }, awayTeam: { teamTricode: "CHA" } }), "away");
  assert.equal(defaultMinutesVantage(null), "away");
});

test("clock parser handles ISO fractional seconds and invalid clocks", () => {
  assert.equal(clockSeconds("PT05M03.50S"), 303.5);
  assert.equal(clockSeconds("12:00"), 720);
  assert.equal(clockSeconds("bad"), null);
  assert.equal(durationLabel(59.9), "1:00");
});
test("verified timeline margins use reconciled scoring rather than an inaccurate upstream margin field", () => {
  const { minutes, game } = minutesFixture();
  minutes.periods[0].stints[0].plusMinus = 500;
  const model = buildMinutesExplorer(minutes, game);
  assert.deepEqual(model.issues, []);
  assert.equal(playerTimeline(model, "home")[0].intervals[0].margin, -2);
});
test("revised substitution event order cannot move points away from the score-reconciled interval", () => {
  const { minutes, game } = minutesFixture();
  // The same FT is now officially credited to the outgoing interval even
  // though the revised PBP places its substitution ahead of the FT.
  minutes.periods[0].stints[0].awayScore = 4;
  minutes.periods[0].stints[1].awayScore = 0;
  game.boxScore.away.players[0].plusMinusPoints = 2;
  const model = buildMinutesExplorer(minutes, game);
  assert.deepEqual(model.issues, []);
  const rows = buildCombos(model, "away", [1, 6]);
  assert.equal(rows.find((row) => row.mask === 1).own.points, 4);
  assert.equal(rows.find((row) => row.mask === 2).own.points, 0);
  assert.equal(playerTimeline(model, "away").find((row) => row.personId === 1).intervals[0].margin, 2);
  game.boxScore.away.players[0].plusMinusPoints = 999;
  assert.ok(buildMinutesExplorer(minutes, game).issues.some((issue) => /box-score plus/.test(issue)));
});
test("substitution boundary shot stays with outgoing player; subsequent same-clock FT goes to incoming player", () => {
  const { minutes, game } = minutesFixture();
  const before = JSON.stringify({ minutes, game });
  const model = buildMinutesExplorer(minutes, game);
  assert.deepEqual(model.issues, []);
  const rows = buildCombos(model, "away", [1, 6]);
  assert.equal(rows.length, 4);
  const outgoing = rows.find((row) => row.mask === 1), incoming = rows.find((row) => row.mask === 2);
  assert.equal(outgoing.own.points, 3); assert.equal(incoming.own.points, 1);
  assert.equal(outgoing.seconds, 360); assert.equal(incoming.seconds, 360);
  assert.equal(outgoing.plusMinus, 1); assert.equal(incoming.plusMinus, 1);
  assert.equal(rows.reduce((sum, row) => sum + row.seconds, 0), 720);
  assert.equal(rows.reduce((sum, row) => sum + row.own.points, 0), 4);
  assert.equal(JSON.stringify({ minutes, game }), before);
});
test("timeline merges continuous player appearances, but keeps periods separate and reverses away margin", () => {
  const { minutes, game } = minutesFixture();
  let model = buildMinutesExplorer(minutes, game);
  assert.equal(playerTimeline(model, "home")[0].intervals.length, 1);
  assert.equal(playerTimeline(model, "home")[0].intervals[0].margin, -2);
  assert.equal(playerTimeline(model, "away").find((row) => row.personId === 2).intervals[0].margin, 2);
  minutes.periods.push({ period: 5, stints: [{ ...minutes.periods[0].stints[0], startClock: "5:00", endClock: "0:00" }] });
  model = buildMinutesExplorer(minutes, game);
  assert.equal(model.totalSeconds, 3180);
  assert.equal(playerTimeline(model, "home")[0].intervals.length, 2);
});
test("ratings use aggregate counts and separate offensive/defensive denominators; empty denominators are unknown", () => {
  const a = { points: 10, fga: 5, fgm: 4, three: 2, fta: 2, oreb: 1, tov: 1 };
  const b = { points: 6, fga: 6, fgm: 3, three: 0, fta: 0, oreb: 0, tov: 0 };
  const row = comboMetrics(a, b);
  assert.equal(row.possessions, 5.88); assert.equal(row.drtg, 100);
  assert.equal(row.efg, 100); assert.equal(row.opponentEfg, 50);
  assert.equal(row.tov, 100 / 6.88);
  const empty = Object.fromEntries(Object.keys(a).map((key) => [key, 0]));
  assert.equal(comboMetrics(empty, empty).ortg, null);
});
test("missing PBP, gaps, invalid lineups, and mismatched totals are flagged instead of fabricated", () => {
  const { minutes, game } = minutesFixture();
  assert.ok(buildMinutesExplorer(minutes, { ...game, playByPlayActions: [] }).issues.length);
  minutes.periods[0].stints[0].startClock = "11:00";
  assert.ok(buildMinutesExplorer(minutes, game).issues.some((issue) => /gaps/.test(issue)));
  minutes.periods[0].stints[0].playersAway = [];
  assert.ok(buildMinutesExplorer(minutes, game).issues.some((issue) => /five/.test(issue)));
});
test("team offensive rebound bookkeeping is excluded and team turnovers without a person count", () => {
  const { minutes, game } = minutesFixture();
  game.playByPlayActions.splice(2, 0,
    { actionNumber: 90, period: 1, clock: "9:00", actionType: "rebound", subType: "offensive", personId: 0, teamId: 1 },
    { actionNumber: 91, period: 1, clock: "8:00", actionType: "turnover", personId: 0, teamId: 1 });
  const rows = buildCombos(buildMinutesExplorer(minutes, game), "away", [1]);
  assert.equal(rows[0].own.oreb, 0); assert.equal(rows[0].own.tov, 1);
});
