// Match the database's one-call-per-game/action constraint. NBA feeds can repeat
// a foul action for multiple fouled players; that is still one official decision.
export function deduplicateOfficialCallEvents(events) {
  const unique = new Map();
  for (const event of events) {
    const key = JSON.stringify(event.actionNumber == null
      ? [event.gameId, event.period, event.gameClock, event.description]
      : [event.gameId, event.actionNumber]);
    const previous = unique.get(key);
    if (previous) {
      const fields = ["period", "gameClock", "actionType", "subType", "descriptor", "description", "officialId", "officialName", "teamId", "primaryCategory", "secondaryCategory"];
      if (fields.some((field) => String(previous[field] ?? "") !== String(event[field] ?? ""))) {
        throw new Error(`Conflicting officiating events for game ${event.gameId}, action ${event.actionNumber}; refusing an ambiguous import.`);
      }
      continue;
    }
    unique.set(key, event);
  }
  return [...unique.values()];
}
