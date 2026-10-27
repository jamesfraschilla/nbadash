import { assertNonEmptyLiveFeed } from "./liveFeedIntegrity.ts";

export async function segmentFeedSignature(game: Record<string, any>, maxPeriod: number) {
  // Later quarters don't invalidate an earlier recap; corrections to the
  // selected endpoint or earlier events do. Version bumps also expire caches.
  assertNonEmptyLiveFeed(game);
  const actions = (game.playByPlayActions || [])
    .filter((a: Record<string, any>) => Number(a.period) <= maxPeriod && a.actionType !== "status")
    .map((action: Record<string, any>) => Object.fromEntries(Object.keys(action).sort()
      // Feed bookkeeping is not a basketball correction. Keep clock, qualifiers,
      // descriptions, participants, scores, and array ordering significant.
      .filter((key) => !["edited", "timeActual", "orderNumber"].includes(key))
      .map((key) => [key, action[key]])));
  const input = JSON.stringify({ version: 7, actions });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
