import { hasEmptyLivePlayByPlay, assertNonEmptyLiveFeed } from "../supabase/functions/_shared/liveFeedIntegrity.ts";

// Preserve the API's box score and metadata. Only replace missing PBP, never a
// valid feed; reject empty/wrong-game fallback responses just like the primary.
export async function recoverMissingLivePlayByPlay(game, loadPlayByPlay) {
  if (!hasEmptyLivePlayByPlay(game)) return game;
  const payload = await loadPlayByPlay(String(game.gameId));
  const source = payload?.game;
  if (String(source?.gameId) !== String(game.gameId)) {
    throw new Error("Live play-by-play fallback returned a different game");
  }
  const recovered = { ...game, playByPlayActions: source.actions };
  assertNonEmptyLiveFeed(recovered);
  return recovered;
}
