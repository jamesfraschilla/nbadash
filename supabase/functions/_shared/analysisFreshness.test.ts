import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { segmentFeedSignature } from "./analysisFreshness.ts";
Deno.test("analysis caches invalidate corrections but not later-quarter events", async () => {
  const game = { playByPlayActions: [{ period: 1, scoreHome: "32", scoreAway: "35" }] };
  const before = await segmentFeedSignature(game, 1);
  game.playByPlayActions.push({ period: 2, scoreHome: "50", scoreAway: "55" });
  assertEquals(await segmentFeedSignature(game, 1), before);
  game.playByPlayActions[0].scoreAway = "36";
  assertNotEquals(await segmentFeedSignature(game, 1), before);
});
