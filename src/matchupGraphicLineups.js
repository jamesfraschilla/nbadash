import { supabase } from "./supabaseClient.js";
import { getGraphicHeadshotPublicUrl } from "./graphicHeadshotStorage.js";

export const MATCHUP_GRAPHIC_LINEUP_SCOPE_TYPE = "matchup_graphic_team_lineup";
export const MATCHUP_GRAPHIC_PLAYER_SLOTS = 5;
export const MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID = "__custom__";
export const DEFAULT_NBA_MATCHUP_TEAM_ID = "1610612764";
export const DEFAULT_GLEAGUE_MATCHUP_TEAM_ID = "1612709928";

function normalizeLeague(value) {
  return String(value || "").trim() === "gleague" ? "gleague" : "nba";
}

export function getDefaultMatchupGraphicTeamId(league, teamScopes = []) {
  if (normalizeLeague(league) === "nba") return DEFAULT_NBA_MATCHUP_TEAM_ID;
  const normalizedScopes = new Set(
    (Array.isArray(teamScopes) ? teamScopes : [])
      .map((scope) => String(scope || "").trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean)
  );
  return normalizedScopes.has("capital_city") ? DEFAULT_GLEAGUE_MATCHUP_TEAM_ID : "";
}

function normalizeCustomPlayer(value) {
  const headshotStoragePath = String(value?.headshotStoragePath || "").trim();
  return {
    jerseyNum: String(value?.jerseyNum || value?.number || "").trim(),
    lastName: String(value?.lastName || value?.familyName || value?.fullName || "").trim(),
    headshotDataUrl: String(value?.headshotDataUrl || "").trim(),
    headshotUrl: getGraphicHeadshotPublicUrl(headshotStoragePath) || String(value?.headshotUrl || "").trim(),
    headshotStoragePath,
  };
}

function serializeCustomPlayer(value) {
  const normalized = normalizeCustomPlayer(value);
  return {
    jerseyNum: normalized.jerseyNum,
    lastName: normalized.lastName,
    headshotStoragePath: normalized.headshotStoragePath,
  };
}

function normalizePlayerSnapshot(value, teamId) {
  const personId = String(value?.personId || value?.playerId || "").trim();
  const fullName = String(value?.fullName || "").trim();
  if (!personId || !fullName) return null;
  return {
    personId,
    firstName: String(value?.firstName || "").trim(),
    familyName: String(value?.familyName || value?.lastName || "").trim(),
    fullName,
    jerseyNum: String(value?.jerseyNum || value?.number || "").trim(),
    teamId: String(value?.teamId || teamId || "").trim(),
  };
}

export function getMatchupGraphicLineupKey(league, teamId) {
  const normalizedTeamId = String(teamId || "").trim();
  return normalizedTeamId ? `${normalizeLeague(league)}:${normalizedTeamId}` : "";
}

export function normalizeMatchupGraphicLineup(value) {
  const payload = value?.payload && typeof value.payload === "object" ? value.payload : value;
  const scopeKeyParts = String(value?.scope_key || value?.scopeKey || "").split(":");
  const league = normalizeLeague(payload?.league || scopeKeyParts[0]);
  const teamId = String(payload?.teamId || payload?.team_id || scopeKeyParts.slice(1).join(":") || "").trim();
  if (!teamId) return null;

  const playerIds = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, (_, index) => (
    String(payload?.playerIds?.[index] || "").trim()
  ));
  const customPlayers = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, (_, index) => (
    normalizeCustomPlayer(payload?.customPlayers?.[index])
  ));
  const players = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, (_, index) => (
    normalizePlayerSnapshot(payload?.players?.[index], teamId)
  ));

  return {
    schemaVersion: 1,
    league,
    teamId,
    playerIds,
    customPlayers,
    players,
    updatedAt: String(value?.updated_at || value?.updatedAt || payload?.updatedAt || "").trim(),
  };
}

export function buildMatchupGraphicLineupMap(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((lineups, row) => {
    const normalized = normalizeMatchupGraphicLineup(row);
    if (!normalized) return lineups;
    lineups[getMatchupGraphicLineupKey(normalized.league, normalized.teamId)] = normalized;
    return lineups;
  }, {});
}

export function buildMatchupGraphicLineupFromDraft(draft, side, roster = []) {
  const normalizedSide = side === "right" ? "right" : "left";
  const league = normalizeLeague(draft?.league);
  const teamId = String(draft?.[`${normalizedSide}TeamId`] || "").trim();
  if (!teamId) return null;

  const playerIds = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, (_, index) => (
    String(draft?.[`${normalizedSide}PlayerIds`]?.[index] || "").trim()
  ));
  const customPlayers = Array.from({ length: MATCHUP_GRAPHIC_PLAYER_SLOTS }, (_, index) => (
    normalizeCustomPlayer(draft?.[`${normalizedSide}CustomPlayers`]?.[index])
  ));
  const rosterById = new Map((Array.isArray(roster) ? roster : []).map((player) => (
    [String(player?.personId || "").trim(), player]
  )));
  const players = playerIds.map((personId) => (
    personId && personId !== MATCHUP_GRAPHIC_CUSTOM_PLAYER_ID
      ? normalizePlayerSnapshot(rosterById.get(personId), teamId)
      : null
  ));

  return {
    schemaVersion: 1,
    league,
    teamId,
    playerIds,
    customPlayers,
    players,
  };
}

export async function listRemoteMatchupGraphicLineups() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rotations_shared_state")
    .select("scope_key,payload,updated_at")
    .eq("scope_type", MATCHUP_GRAPHIC_LINEUP_SCOPE_TYPE);
  if (error) throw error;
  return (data || []).map(normalizeMatchupGraphicLineup).filter(Boolean);
}

export async function saveRemoteMatchupGraphicLineups(lineups) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const normalizedByKey = new Map();
  (Array.isArray(lineups) ? lineups : []).forEach((lineup) => {
    const normalizedLineup = normalizeMatchupGraphicLineup(lineup);
    if (!normalizedLineup) return;
    normalizedByKey.set(
      getMatchupGraphicLineupKey(normalizedLineup.league, normalizedLineup.teamId),
      normalizedLineup
    );
  });
  const normalized = [...normalizedByKey.values()];
  if (!normalized.length) return [];

  const rows = normalized.map((lineup) => ({
    scope_type: MATCHUP_GRAPHIC_LINEUP_SCOPE_TYPE,
    scope_key: getMatchupGraphicLineupKey(lineup.league, lineup.teamId),
    payload: {
      schemaVersion: 1,
      league: lineup.league,
      teamId: lineup.teamId,
      playerIds: lineup.playerIds,
      customPlayers: lineup.customPlayers.map(serializeCustomPlayer),
      players: lineup.players,
    },
  }));
  const { data, error } = await supabase
    .from("rotations_shared_state")
    .upsert(rows, { onConflict: "scope_type,scope_key" })
    .select("scope_key,payload,updated_at");
  if (error) throw error;
  return (data || []).map(normalizeMatchupGraphicLineup).filter(Boolean);
}
