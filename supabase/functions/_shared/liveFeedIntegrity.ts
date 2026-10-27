// Only full-game responses use this guard: an unplayed segment can be empty.
export function hasEmptyLivePlayByPlay(game: Record<string, any>) {
  return [2, 3].includes(Number(game?.gameStatus))
    && (!Array.isArray(game.playByPlayActions) || game.playByPlayActions.length === 0);
}

export function assertNonEmptyLiveFeed(game: Record<string, any>) {
  if (!hasEmptyLivePlayByPlay(game)) return;
  throw Object.assign(new Error("Live play-by-play is temporarily unavailable. Keeping the last valid snapshot."), {
    code: "EMPTY_LIVE_FEED", status: 503, retryable: true, retryAfterSeconds: 30,
  });
}
