function normalizedRosterName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Keep live roster membership authoritative while filling fields that an older
 * cached response left blank from the bundled, deploy-time roster snapshot.
 */
export function reconcileRosterPlayerFields(remotePlayers, fallbackPlayers) {
  const remote = Array.isArray(remotePlayers) ? remotePlayers : [];
  const fallback = Array.isArray(fallbackPlayers) ? fallbackPlayers : [];
  if (!remote.length) return fallback;

  const fallbackById = new Map();
  const fallbackByName = new Map();
  fallback.forEach((player) => {
    const personId = String(player?.personId || "").trim();
    const name = normalizedRosterName(player?.fullName);
    if (personId) fallbackById.set(personId, player);
    if (name) fallbackByName.set(name, player);
  });

  return remote.map((player) => {
    const personId = String(player?.personId || "").trim();
    const fallbackPlayer = fallbackById.get(personId)
      || fallbackByName.get(normalizedRosterName(player?.fullName));
    if (!fallbackPlayer) return player;
    return {
      ...fallbackPlayer,
      ...player,
      firstName: String(player?.firstName || fallbackPlayer?.firstName || "").trim(),
      familyName: String(player?.familyName || fallbackPlayer?.familyName || "").trim(),
      fullName: String(player?.fullName || fallbackPlayer?.fullName || "").trim(),
      jerseyNum: String(player?.jerseyNum || fallbackPlayer?.jerseyNum || "").trim(),
      teamId: String(player?.teamId || fallbackPlayer?.teamId || "").trim(),
    };
  });
}
