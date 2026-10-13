import { assertEquals } from "jsr:@std/assert@1";
import { normalizeOpeningMinutesData } from "./minutesNormalization.ts";

function fixture() {
  const away = [1, 2, 3, 4, 6].map((personId) => ({ personId, nameI: `A. Player${personId}` }));
  const home = [11, 12, 13, 14, 15].map((personId) => ({ personId, nameI: `H. Player${personId}` }));
  const data = {
    gameId: "0012600038", awayTeam: { teamId: 1 }, homeTeam: { teamId: 2 },
    periods: [{ period: 1, stints: [{
      startClock: "6:55", endClock: "5:45", playersAway: away, playersHome: home,
      homeScore: 5, awayScore: 0, plusMinus: 5,
    }] }],
  };
  const game = {
    boxScore: { away: { players: [1, 2, 3, 4, 5, 6].map((personId) => ({ personId, firstName: "Away", familyName: `Player${personId}` })) } },
    playByPlayActions: [
      { period: 5, clock: "0:00", actionType: "status", scoreHome: "0", scoreAway: "0", orderNumber: 0 },
      { period: 1, clock: "12:00", actionType: "period", subType: "start", scoreHome: "0", scoreAway: "0", orderNumber: 1 },
      { period: 1, clock: "6:55", actionType: "timeout", scoreHome: "12", scoreAway: "10", orderNumber: 2 },
      { period: 1, clock: "6:55", actionType: "substitution", subType: "out", teamId: 1, personId: 5, scoreHome: "12", scoreAway: "10", orderNumber: 3 },
      { period: 1, clock: "6:55", actionType: "substitution", subType: "in", teamId: 1, personId: 6, scoreHome: "12", scoreAway: "10", orderNumber: 4 },
      { period: 1, clock: "6:55", actionType: "freethrow", scoreHome: "13", scoreAway: "10", orderNumber: 5 },
    ],
  };
  return { data, game };
}

Deno.test("restores omitted opening lineup, minutes and 12-10 score without assigning same-clock free throws to it", () => {
  const { data, game } = fixture();
  const normalized = normalizeOpeningMinutesData(data, game)!;
  const [opening, afterSub] = normalized.periods[0].stints;
  assertEquals(opening.startClock, "12:00");
  assertEquals(opening.endClock, "6:55");
  assertEquals(opening.playersAway.map((p: { personId: number }) => p.personId), [1, 2, 3, 4, 5]);
  assertEquals([opening.homeScore, opening.awayScore, opening.plusMinus], [12, 10, 2]);
  assertEquals(afterSub.playersAway.map((p: { personId: number }) => p.personId), [1, 2, 3, 4, 6]);
  assertEquals(afterSub.prevPlayersAway, opening.playersAway);
  assertEquals(normalized.openingStintRepair.missingSeconds, 305);
  assertEquals(data.periods[0].stints[0].startClock, "6:55");
  assertEquals(normalizeOpeningMinutesData(normalized, game), normalized);
});

Deno.test("leaves an incomplete substitution feed unresolved instead of inventing starters", () => {
  const { data, game } = fixture();
  game.playByPlayActions = game.playByPlayActions.filter((action) => action.subType !== "out");
  const normalized = normalizeOpeningMinutesData(data, game)!;
  assertEquals(normalized.openingStintRepair.status, "unresolved");
  assertEquals(normalized.periods, data.periods);
});

Deno.test("recovers multiple missing opening stints by reversing each substitution boundary", () => {
  const { data, game } = fixture();
  data.periods[0].stints[0].playersAway[3] = { personId: 7, nameI: "A. Player7" };
  game.playByPlayActions.push(
    { period: 1, clock: "8:00", actionType: "timeout", scoreHome: "4", scoreAway: "4", orderNumber: 6 },
    { period: 1, clock: "8:00", actionType: "substitution", subType: "out", teamId: 1, personId: 4, scoreHome: "4", scoreAway: "4", orderNumber: 7 },
    { period: 1, clock: "8:00", actionType: "substitution", subType: "in", teamId: 1, personId: 7, scoreHome: "4", scoreAway: "4", orderNumber: 8 },
  );
  const normalized = normalizeOpeningMinutesData(data, game)!;
  assertEquals(normalized.periods[0].stints.length, 3);
  assertEquals(normalized.periods[0].stints.map((s: { startClock: string }) => s.startClock), ["12:00", "8:00", "6:55"]);
  assertEquals(normalized.periods[0].stints[0].playersAway.map((p: { personId: number }) => p.personId), [1, 2, 3, 4, 5]);
  assertEquals(normalized.periods[0].stints[1].plusMinus, 2);
});

Deno.test("preserves a free throw scored between two teams' substitutions at the same clock", () => {
  const { data, game: originalGame } = fixture();
  data.periods[0].stints[0].playersHome[0] = { personId: 16, nameI: "H. Player16" };
  const game = { ...originalGame, playByPlayActions: [
    ...originalGame.playByPlayActions,
    { period: 1, clock: "6:55", actionType: "substitution", subType: "out", teamId: 2, personId: 11, playerNameI: "H. Player11", scoreHome: "13", scoreAway: "10", orderNumber: 6 },
    { period: 1, clock: "6:55", actionType: "substitution", subType: "in", teamId: 2, personId: 16, playerNameI: "H. Player16", scoreHome: "13", scoreAway: "10", orderNumber: 7 },
    { period: 1, clock: "5:45", actionType: "period", subType: "end", scoreHome: "17", scoreAway: "10", orderNumber: 8 },
  ] };
  const normalized = normalizeOpeningMinutesData(data, game)!;
  const stints = normalized.periods[0].stints;
  const boundary = stints.find((stint: { startClock: string; endClock: string }) => stint.startClock === stint.endClock);
  assertEquals(boundary.homeScore, 1);
  assertEquals(boundary.playersHome[0].personId, 11);
  assertEquals(stints.reduce((sum: number, stint: { homeScore: number }) => sum + stint.homeScore, 0), 17);
});

Deno.test("removes the zero-score 12-minute overtime placeholder without altering real overtime", () => {
  const real = { startClock: "5:00", endClock: "0:00", homeScore: 16, awayScore: 10 };
  const data = { periods: [{ period: 5, stints: [
    { startClock: "12:00", endClock: "0:00", homeScore: 0, awayScore: 0 }, real,
  ] }] };
  const normalized = normalizeOpeningMinutesData(data, null)!;
  assertEquals(normalized.periods[0].stints, [real]);
  assertEquals(data.periods[0].stints.length, 2);
});

Deno.test("restores a missing Q2 opening with period-relative, not cumulative scores", () => {
  const { data, game } = fixture();
  data.periods[0].period = 2;
  game.playByPlayActions = game.playByPlayActions.filter((a) => a.period === 1).map((a) => ({ ...a, period: 2,
    scoreHome: String(Number(a.scoreHome) + 40), scoreAway: String(Number(a.scoreAway) + 30) }));
  game.playByPlayActions.push({ ...game.playByPlayActions[0], clock: "5:45", subType: "end", scoreHome: "57", scoreAway: "40", orderNumber: 6 });
  const normalized = normalizeOpeningMinutesData(data, game)!;
  assertEquals(normalized.periods[0].stints[0].startClock, "12:00");
  assertEquals(normalized.periods[0].stints.reduce((n: number, s: { homeScore: number }) => n + s.homeScore, 0), 17);
  assertEquals(normalized.periods[0].stints.reduce((n: number, s: { awayScore: number }) => n + s.awayScore, 0), 10);
  assertEquals(normalized.periodStintRepairs[0].status, "repaired");
});

Deno.test("repairs scoring omitted between same-clock substitutions even with an existing 12:00 opening", () => {
  const { data, game } = fixture();
  data.periods[0].period = 3;
  data.periods[0].stints[0].startClock = "12:00";
  data.periods[0].stints[0].endClock = "0:00";
  data.periods[0].stints[0].homeScore = 12;
  data.periods[0].stints[0].awayScore = 10;
  game.playByPlayActions = game.playByPlayActions.filter((a) => a.period === 1).map((a) => ({ ...a, period: 3 }));
  // The opening lineup already contains player 6. Its between-period swap
  // must not be applied again while rebuilding the scoring timeline.
  game.playByPlayActions[2].clock = "12:00";
  game.playByPlayActions[3].clock = "12:00";
  game.playByPlayActions[2].scoreHome = "0"; game.playByPlayActions[2].scoreAway = "0";
  game.playByPlayActions[3].scoreHome = "0"; game.playByPlayActions[3].scoreAway = "0";
  game.playByPlayActions.push({ ...game.playByPlayActions[0], clock: "0:00", subType: "end", scoreHome: "13", scoreAway: "10", orderNumber: 6 });
  const normalized = normalizeOpeningMinutesData(data, game)!;
  assertEquals(normalized.periods[0].stints.reduce((n: number, s: { homeScore: number }) => n + s.homeScore, 0), 13);
  assertEquals(normalized.periodStintRepairs[0].status, "repaired");
});
