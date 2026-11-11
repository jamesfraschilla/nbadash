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
test("server reconciler uses the keyed NBA API without CloudFront", async () => {
  const { box, pbp } = sources();
  const team = id => ({ teamId: id, players: [{ personId: id, statistics: { points: 2 } }], statistics: { points: 2 } });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(String(url));
    assert.equal(options.headers["X-NBA-Api-Key"], "local-test-key");
    if (String(url).includes("/scores/")) return Response.json({ scoreboard: { games: [box.game] } });
    if (String(url).includes("/boxscore")) return Response.json({ gameId: id, homeTeam: team(1), awayTeam: team(2) });
    return Response.json({ gameId: id, actions: pbp.game.actions });
  };
  const game = await fetchRecoverableGame(id, fetcher, "local-test-key");
  assert.equal(game.playByPlayActions.length, 1);
  assert.equal(game.feedAvailability.source, "nba-api");
  assert.equal(calls.some(url => url.includes("cloudfront")), false);
});
test("final score verification ignores appended corrections to earlier quarters", () => {
  const { box, pbp } = sources();
  pbp.game.actions = [
    { period: 4, clock: "PT00M00.00S", orderNumber: 20, scoreHome: "2", scoreAway: "2" },
    { period: 1, clock: "PT00M00.00S", orderNumber: 30, scoreHome: "1", scoreAway: "0" },
    { period: 4, clock: "PT01M00.00S", orderNumber: 40, scoreHome: "1", scoreAway: "2" },
  ];
  assert.equal(normalizeNbaLiveRecovery(id, box, pbp).homeTeam.score, 2);
  pbp.game.actions[0].scoreHome = "3";
  assert.throws(() => normalizeNbaLiveRecovery(id, box, pbp), /scores/);
});
test("server reconciler falls back to the verified NBA CDN when the API is unavailable", async () => {
  const { box, pbp } = sources();
  const calls = [];
  const fetcher = async url => {
    const target = String(url); calls.push(target);
    if (target.includes("api.nba.com")) return new Response("down", { status: 503 });
    return Response.json(target.includes("/boxscore/") ? box : pbp);
  };
  assert.equal((await fetchRecoverableGame(id, fetcher, "key")).feedAvailability.limited, true);
  assert.equal(calls.some(url => url.includes("cloudfront")), false);
  box.game.gameId = "0022600016";
  await assert.rejects(fetchRecoverableGame(id, fetcher, "key"), /identity/);
});
test("server reconciler preserves a primary final and recovers missing play-by-play from CDN", async () => {
  const { box, pbp } = sources();
  const team = teamId => ({ teamId, players: [{ personId: teamId, statistics: { points: 2 } }], statistics: { points: 2 } });
  const fetcher = async url => {
    const target = String(url);
    if (target.includes('cdn.nba.com')) return Response.json(target.includes('/boxscore/') ? box : pbp);
    if (target.includes('/scores/')) return Response.json({ scoreboard: { games: [box.game] } });
    if (target.includes('/boxscore')) return Response.json({ gameId: id, homeTeam: team(1), awayTeam: team(2) });
    return Response.json({ gameId: id, actions: [] });
  };
  const game = await fetchRecoverableGame(id, fetcher, 'key');
  assert.equal(game.feedAvailability.source, 'nba-pbp-backup');
  assert.deepEqual(game.playByPlayActions, pbp.game.actions);
  pbp.game.actions[0].scoreHome = '1';
  await assert.rejects(fetchRecoverableGame(id, fetcher, 'key'), /scores/);
});
test("server reconciler uses only the NBA CDN when no key is configured", async () => {
  const { box, pbp } = sources();
  const calls = [];
  const fetcher = async url => { const target = String(url); calls.push(target); return Response.json(target.includes("/boxscore/") ? box : pbp); };
  await fetchRecoverableGame(id, fetcher, "");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.startsWith("https://cdn.nba.com/")));
});
