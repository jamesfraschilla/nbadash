import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { segmentFeedSignature } from "./analysisFreshness.ts";
import { assertRejects } from "jsr:@std/assert@1";
Deno.test("analysis caches invalidate corrections but not later-quarter events", async () => {
  const game = { playByPlayActions: [{ period: 1, scoreHome: "32", scoreAway: "35" }] };
  const before = await segmentFeedSignature(game, 1);
  game.playByPlayActions.push({ period: 2, scoreHome: "50", scoreAway: "55" });
  assertEquals(await segmentFeedSignature(game, 1), before);
  game.playByPlayActions[0].scoreAway = "36";
  assertNotEquals(await segmentFeedSignature(game, 1), before);
});

Deno.test("metadata-only updates do not invalidate recaps, but basketball corrections do", async () => {
  const action = { period: 1, clock: "1:00", actionNumber: 1, scoreHome: "2", edited: "first", orderNumber: 1, timeActual: "first" };
  const signature = await segmentFeedSignature({ playByPlayActions: [action] }, 1);
  const metadata = { ...action, edited: "later", orderNumber: 500, timeActual: "later" };
  assertEquals(await segmentFeedSignature({ playByPlayActions: [metadata] }, 1), signature);
  for (const patch of [{ clock: "0:59" }, { scoreHome: "3" }, { qualifiers: ["2ndchance"] }, { subType: "corrected" }]) {
    assertNotEquals(await segmentFeedSignature({ playByPlayActions: [{ ...metadata, ...patch }] }, 1), signature);
  }
});

Deno.test("live and final empty feeds cannot become valid cache signatures", async () => {
  for (const gameStatus of [2, 3]) {
    await assertRejects(() => segmentFeedSignature({ gameStatus, playByPlayActions: [] }, 4), Error, "temporarily unavailable");
  }
  await segmentFeedSignature({ gameStatus: 1 }, 1);
});
