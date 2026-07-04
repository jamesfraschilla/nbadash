export const normalizeRosterPersonId = (value) => String(value || "").trim();
export const normalizeRosterName = (value) => String(value || "").trim().replace(/\s+/g, " ");
export const buildRosterMatchKey = (value) => (
  normalizeRosterName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
);

export function buildManualRosterPlayerKey(player, teamId) {
  const seed =
    normalizeRosterPersonId(player?.matchupId) ||
    normalizeRosterPersonId(player?.id) ||
    buildRosterMatchKey(player?.fullName || player?.name || player?.display || "");
  const safeSeed = String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safeSeed) return "";
  return `manual:${String(teamId || "team").trim() || "team"}:${safeSeed}`;
}

function mergeHeadshotOverrideKeys(...groups) {
  const values = groups
    .flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []))
    .map((key) => String(key || "").trim())
    .filter(Boolean);
  return [...new Set(values)];
}

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
        headshotPersonId: personId,
        jerseyNum: String(player?.jerseyNum || "").trim(),
        position: String(player?.position || "").trim(),
        height: String(player?.height || "").trim(),
        teamId: String(player?.teamId || teamId || "").trim() || String(teamId || "").trim(),
      };
    })
    .filter(Boolean)
);

export function mergeRosterPools(sharedPlayers, livePlayers, teamId = "") {
  const next = [];
  const byPersonId = new Map();
  const byName = new Map();

  const upsertPlayer = (player, preferExisting = false) => {
    if (!player) return;
    const officialPersonId = normalizeRosterPersonId(player.personId);
    const manualPersonId = officialPersonId ? "" : buildManualRosterPlayerKey(player, teamId);
    const personId = officialPersonId || manualPersonId;
    const fullName = normalizeRosterName(player.fullName || player.name || player.display || "");
    const nameKey = buildRosterMatchKey(fullName);
    if (!personId || !fullName) return;
    const headshotOverrideKeys = mergeHeadshotOverrideKeys(player.headshotOverrideKeys, manualPersonId);
    const existing =
      (personId && byPersonId.get(personId)) ||
      (nameKey && byName.get(nameKey)) ||
      null;

    if (existing) {
      if (!preferExisting) {
        Object.assign(existing, {
          ...player,
          personId,
          headshotPersonId: player.headshotPersonId ?? (officialPersonId || manualPersonId),
          headshotOverrideKeys: mergeHeadshotOverrideKeys(existing.headshotOverrideKeys, headshotOverrideKeys),
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
      headshotPersonId: player.headshotPersonId ?? (officialPersonId || manualPersonId),
      headshotOverrideKeys,
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
    return teamScope ? mergeRosterPools(sharedPlayers, gameRoster, safeTeamId) : gameRoster;
  }

  const liveRoster = normalizeLiveRosterPlayers(liveRosterTeams?.[safeTeamId]?.players, safeTeamId);
  return teamScope ? mergeRosterPools(sharedPlayers, liveRoster, safeTeamId) : liveRoster;
}
