export const normalizeRosterPersonId = (value) => String(value || "").trim();
export const normalizeRosterName = (value) => String(value || "").trim().replace(/\s+/g, " ");
export const buildRosterMatchKey = (value) => (
  normalizeRosterName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
);

export const normalizeLiveRosterPlayers = (players, teamId) => (
  (Array.isArray(players) ? players : [])
    .map((player) => {
      const personId = normalizeRosterPersonId(player?.personId);
      const firstName = normalizeRosterName(player?.firstName || "");
      const familyName = normalizeRosterName(player?.familyName || "");
      const fullName = normalizeRosterName(player?.fullName || [firstName, familyName].filter(Boolean).join(" "));
      if (!personId || !fullName) return null;
      return {
        personId,
        firstName,
        familyName,
        fullName,
        display: fullName,
        name: fullName,
        jerseyNum: String(player?.jerseyNum || "").trim(),
        position: String(player?.position || "").trim(),
        height: String(player?.height || "").trim(),
        teamId: String(player?.teamId || teamId || "").trim() || String(teamId || "").trim(),
      };
    })
    .filter(Boolean)
);

export function mergeRosterPools(sharedPlayers, livePlayers) {
  const next = [];
  const byPersonId = new Map();
  const byName = new Map();

  const upsertPlayer = (player, preferExisting = false) => {
    if (!player) return;
    const personId = normalizeRosterPersonId(player.personId);
    const fullName = normalizeRosterName(player.fullName || player.display || player.name || "");
    const nameKey = buildRosterMatchKey(fullName);
    const existing =
      (personId && byPersonId.get(personId)) ||
      (nameKey && byName.get(nameKey)) ||
      null;

    if (existing) {
      if (!preferExisting) {
        Object.assign(existing, {
          ...player,
          cap: existing.cap ?? player.cap,
          display: existing.display || player.display || player.fullName || player.name || "",
          name: existing.name || player.name || player.fullName || player.display || "",
        });
      }
      if (personId) byPersonId.set(personId, existing);
      if (nameKey) byName.set(nameKey, existing);
      return;
    }

    const entry = {
      ...player,
      personId,
      fullName: fullName || normalizeRosterName(player.display || player.name || ""),
      display: normalizeRosterName(player.display || player.fullName || player.name || ""),
      name: normalizeRosterName(player.name || player.fullName || player.display || ""),
    };
    next.push(entry);
    if (personId) byPersonId.set(personId, entry);
    if (nameKey) byName.set(nameKey, entry);
  };

  (sharedPlayers || []).forEach((player) => upsertPlayer(player, true));
  (livePlayers || []).forEach((player) => upsertPlayer(player, false));
  return next;
}

export function buildMatchupRosterPool({
  teamId,
  teamScope = "",
  sharedPlayers = [],
  liveRosterTeams = {},
  gameRosterPlayers = [],
  isSummerLeague = false,
}) {
  const safeTeamId = String(teamId || "").trim();
  const gameRoster = normalizeLiveRosterPlayers(gameRosterPlayers, safeTeamId);

  if (isSummerLeague) {
    return teamScope ? mergeRosterPools(sharedPlayers, gameRoster) : gameRoster;
  }

  const liveRoster = normalizeLiveRosterPlayers(liveRosterTeams?.[safeTeamId]?.players, safeTeamId);
  return teamScope ? mergeRosterPools(sharedPlayers, liveRoster) : liveRoster;
}
