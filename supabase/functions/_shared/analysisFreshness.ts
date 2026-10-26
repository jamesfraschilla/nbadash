export async function segmentFeedSignature(game: Record<string, any>, maxPeriod: number) {
  // Later quarters don't invalidate an earlier recap; corrections to the
  // selected endpoint or earlier events do. Version bumps also expire caches.
  const actions = (game.playByPlayActions || []).filter((a: Record<string, any>) => Number(a.period) <= maxPeriod && a.actionType !== "status");
  const input = JSON.stringify({ version: 6, actions });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
