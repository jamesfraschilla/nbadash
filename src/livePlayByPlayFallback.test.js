import test from "node:test";
import assert from "node:assert/strict";
import { recoverMissingLivePlayByPlay } from "./livePlayByPlayFallback.js";

test("missing live PBP recovers without losing scores, box score or metadata", async () => {
  const game = { gameId: "0022600015", gameStatus: 2, boxScore: { home: { players: [1] } }, homeTeam: { score: 51 } };
  const actions = [{ actionNumber: 1, period: 1, possession: 1610612764 }];
  const recovered = await recoverMissingLivePlayByPlay(game, async id => ({ game: { gameId: id, actions } }));
  assert.equal(recovered.playByPlayActions, actions);
  assert.equal(recovered.boxScore, game.boxScore);
  assert.equal(recovered.homeTeam.score, 51);
  assert.equal(game.playByPlayActions, undefined);
});
test("valid PBP and pregame never trigger extra requests", async () => {
  for (const game of [{ gameStatus: 1 }, { gameStatus: 2, playByPlayActions: [{}] }]) {
    assert.equal(await recoverMissingLivePlayByPlay(game, () => { throw new Error("unexpected request"); }), game);
  }
});
test("empty, wrong-game and unavailable fallbacks cannot become successful snapshots", async () => {
  const game = { gameId: "0022600015", gameStatus: 2 };
  await assert.rejects(recoverMissingLivePlayByPlay(game, async () => ({ game: { gameId: game.gameId, actions: [] } })), { code: "EMPTY_LIVE_FEED" });
  await assert.rejects(recoverMissingLivePlayByPlay(game, async () => ({ game: { gameId: "wrong", actions: [{}] } })), /different game/);
  await assert.rejects(recoverMissingLivePlayByPlay(game, async () => { throw new Error("offline"); }), /offline/);
});
