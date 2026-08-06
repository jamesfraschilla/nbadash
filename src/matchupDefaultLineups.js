import {
  MATCHUP_GRAPHIC_PLAYER_SLOTS,
  getMatchupGraphicLineupKey,
} from "./matchupGraphicLineups.js";

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactInitials(value) {
  return String(value || "").replace(/\b([a-z])\s+([a-z])\b/g, "$1$2");
}

function playerFullName(player) {
  return String(player?.fullName || [player?.firstName, player?.familyName].filter(Boolean).join(" ")).trim();
}

function rosterSearchKeys(player) {
  const fullName = playerFullName(player);
  const firstName = String(player?.firstName || "").trim();
  const familyName = String(player?.familyName || player?.lastName || "").trim();
  const keys = [
    normalizeName(fullName),
    normalizeName([firstName, familyName].filter(Boolean).join(" ")),
  ];
  if (firstName && familyName) {
    keys.push(normalizeName(`${firstName[0]} ${familyName}`));
  }
  keys.forEach((key) => keys.push(compactInitials(key)));
  return [...new Set(keys.filter(Boolean))];
}

function buildRosterNameIndex(roster) {
  const index = new Map();
  (Array.isArray(roster) ? roster : []).forEach((player) => {
    if (!player?.personId) return;
    rosterSearchKeys(player).forEach((key) => {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(player);
    });
  });
  return index;
}

function resolveRosterPlayer(defaultPlayer, nameIndex, usedIds) {
  const candidates = rosterSearchKeys(defaultPlayer)
    .flatMap((key) => nameIndex.get(key) || [])
    .filter((player) => player?.personId && !usedIds.has(String(player.personId)));
  return candidates[0] || null;
}

function normalizeDefaultPlayer(value) {
  return {
    fullName: String(value?.fullName || value?.displayName || value?.name || "").trim(),
    firstName: String(value?.firstName || "").trim(),
    familyName: String(value?.familyName || value?.lastName || "").trim(),
    position: String(value?.position || "").trim(),
    sourceId: String(value?.espnAthleteId || value?.sourceId || "").trim(),
  };
}

export function buildMatchupDefaultLineup({ league = "nba", teamId, defaultTeam, roster }) {
  const normalizedTeamId = String(teamId || defaultTeam?.teamId || "").trim();
  if (!normalizedTeamId) return null;
  const nameIndex = buildRosterNameIndex(roster);
  const usedIds = new Set();
  const playerIds = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, () => "");
  const players = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, () => null);
  const unmatched = [];
  let resolvedCount = 0;

  (Array.isArray(defaultTeam?.players) ? defaultTeam.players : [])
    .map(normalizeDefaultPlayer)
    .filter((player) => player.fullName)
    .slice(0, MATCHUP_GRAPHIC_PLAYER_SLOTS)
    .forEach((defaultPlayer, index) => {
      const rosterPlayer = resolveRosterPlayer(defaultPlayer, nameIndex, usedIds);
      if (!rosterPlayer) {
        unmatched.push(defaultPlayer.fullName);
        return;
      }
      const personId = String(rosterPlayer.personId || "").trim();
      usedIds.add(personId);
      playerIds[index] = personId;
      players[index] = rosterPlayer;
      resolvedCount += 1;
    });

  if (!resolvedCount) return null;

  return {
    schemaVersion: 1,
    league: league === "gleague" ? "gleague" : "nba",
    teamId: normalizedTeamId,
    playerIds,
    customPlayers: Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, () => ({
      jerseyNum: "",
      lastName: "",
      headshotDataUrl: "",
      headshotUrl: "",
      headshotStoragePath: "",
    })),
    players,
    source: defaultTeam?.source || "external-depth-chart",
    sourceUrl: defaultTeam?.sourceUrl || "",
    unmatched,
  };
}

export function buildMatchupDefaultLineupMap(payload, rosterMap, league = "nba") {
  const teams = payload?.teams && typeof payload.teams === "object" ? payload.teams : {};
  return Object.entries(teams).reduce((lineups, [teamId, defaultTeam]) => {
    const lineup = buildMatchupDefaultLineup({
      league,
      teamId,
      defaultTeam,
      roster: rosterMap?.[teamId] || [],
    });
    if (lineup) {
      lineups[getMatchupGraphicLineupKey(lineup.league, lineup.teamId)] = lineup;
    }
    return lineups;
  }, {});
}
