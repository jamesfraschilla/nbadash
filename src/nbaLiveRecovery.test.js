import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNbaLiveRecovery, fetchRecoverableGame } from "../supabase/functions/_shared/nbaLiveRecovery.ts";
const id = "0022600015";
function sources() {
  const team = teamId => ({ teamId, score: 2, statistics: { points: 2, reboundsPersonal: 4, reboundsTotal: 6 }, players: [{ personId: teamId, statistics: { points: 2, minutes: "PT02M00.00S" } }] });
  return { box: { game: { gameId: id, gameStatus: 3, period: 4, homeTeam: team(1), awayTeam: team(2) } },
    pbp: { game: { gameId: id, actions: [{ actionNumber: 1, scoreHome: "2", scoreAway: "2" }] } } };
}
test("NBA recovery maps public player/team stats and never invents advanced stats", () => {
  const { box, pbp } = sources();
  const game = normalizeNbaLiveRecovery(id, box, pbp);
  assert.equal(game.boxScore.home.totals.reboundsTotal, 4);
  assert.equal(game.boxScore.home.players[0].points, 2);
  assert.deepEqual(game.teamStats.home, {});
  assert.equal(game.feedAvailability.limited, true);
  assert.throws(() => normalizeNbaLiveRecovery("wrong", box, pbp), /identity/);
  pbp.game.actions[0].scoreHome = "1";
  assert.throws(() => normalizeNbaLiveRecovery(id, box, pbp), /scores/);
  pbp.game.actions = [];
  assert.throws(() => normalizeNbaLiveRecovery(id, box, pbp), /incomplete/);
});
test("server reconciler recovers omitted PBP but preserves primary statistics", async () => {
  const { box, pbp } = sources();
  const primary = { ...box.game, boxScore: { home: {}, away: {} }, teamStats: { home: { possessions: 90 } } };
  const fetcher = async url => Response.json(url.includes("cloudfront") ? primary : url.includes("/boxscore/") ? box : pbp);
  const result = await fetchRecoverableGame(id, fetcher);
  assert.equal(result.playByPlayActions.length, 1);
  assert.equal(result.teamStats.home.possessions, 90);
  assert.equal(result.feedAvailability.limited, false);
  primary.homeTeam.score = 20;
  await assert.rejects(fetchRecoverableGame(id, fetcher), /scores/);
});
test("server reconciler survives primary HTTP failure and validates alternate identity", async () => {
  const { box, pbp } = sources();
  const fetcher = async url => url.includes("cloudfront") ? new Response("down", { status: 503 }) : Response.json(url.includes("/boxscore/") ? box : pbp);
  assert.equal((await fetchRecoverableGame(id, fetcher)).feedAvailability.limited, true);
  box.game.gameId = "0022600016";
  await assert.rejects(fetchRecoverableGame(id, fetcher), /identity/);
});
