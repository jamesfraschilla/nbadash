import { supabase } from "./supabaseClient.js";

const LEGACY_PLAYERS_STORAGE_KEY = "pregame:players:v1";
const PLAYERS_STORAGE_KEY_PREFIX = "pregame:players:v2:";
const PREGAME_ACTION_PAYLOAD = 900000001;
const PREGAME_GLOBAL_PLAYERS_GAME_IDS = {
  washington: "9999999901",
  capital_city: "9999999903",
};

export function isWashingtonTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "WAS" || name.includes("washington") || name.includes("wizards");
}

export function isCapitalCityTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "CCG" || name.includes("capital city") || name.includes("go-go") || name.includes("gogo");
}

export function getPregameTeamScope(game) {
  if (isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam)) return "washington";
  if (isCapitalCityTeam(game?.homeTeam) || isCapitalCityTeam(game?.awayTeam)) return "capital_city";
  return null;
}

export function normalizePregamePlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePersonId(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function normalizeMatchName(value) {
  const normalized = normalizePregamePlayerName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\b(JR|SR|II|III|IV|V)\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function getLastName(name) {
  const parts = normalizePregamePlayerName(name).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : "";
}

export function sortPregamePlayersByLastName(players) {
  return [...players].sort((a, b) => {
    const aLast = getLastName(a.name);
    const bLast = getLastName(b.name);
    if (aLast !== bLast) return aLast.localeCompare(bLast);
    return normalizePregamePlayerName(a.name).localeCompare(normalizePregamePlayerName(b.name));
  });
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function normalizePregamePlayers(rawPlayers) {
  return sortPregamePlayersByLastName(
    (Array.isArray(rawPlayers) ? rawPlayers : [])
      .map((player) => ({
        id: String(player?.id || crypto.randomUUID()),
        name: normalizePregamePlayerName(player?.name || ""),
        display: normalizePregamePlayerName(player?.display || ""),
        personId: normalizePersonId(player?.personId),
      }))
      .filter((player) => player.name && player.display)
  );
}

export function getTeamBoxScorePlayers(game, teamScope) {
  if (!game || !teamScope) return [];
  const homeMatches = teamScope === "washington"
    ? isWashingtonTeam(game.homeTeam)
    : isCapitalCityTeam(game.homeTeam);
  const awayMatches = teamScope === "washington"
    ? isWashingtonTeam(game.awayTeam)
    : isCapitalCityTeam(game.awayTeam);
  if (homeMatches) return Array.isArray(game?.boxScore?.home?.players) ? game.boxScore.home.players : [];
  if (awayMatches) return Array.isArray(game?.boxScore?.away?.players) ? game.boxScore.away.players : [];
  return [];
}

function buildApiPlayerNameCandidates(player) {
  const candidates = [
    player?.fullName,
    player?.name,
    [player?.firstName, player?.familyName].filter(Boolean).join(" "),
  ];
  return candidates
    .map(normalizeMatchName)
    .filter(Boolean);
}

export function linkPregamePlayersToApiPlayers(players, apiPlayers) {
  if (!Array.isArray(players) || !players.length || !Array.isArray(apiPlayers) || !apiPlayers.length) {
    return players;
  }

  const apiByName = new Map();
  apiPlayers.forEach((player) => {
    const personId = normalizePersonId(player?.personId);
    if (!personId) return;
    buildApiPlayerNameCandidates(player).forEach((candidate) => {
      if (!candidate) return;
      const existing = apiByName.get(candidate);
      if (!existing) {
        apiByName.set(candidate, { personId, ambiguous: false });
        return;
      }
      if (existing.personId !== personId) {
        apiByName.set(candidate, { personId: "", ambiguous: true });
      }
    });
  });

  let changed = false;
  const nextPlayers = players.map((player) => {
    const currentPersonId = normalizePersonId(player?.personId);
    if (currentPersonId) return player;

    const playerCandidates = [
      normalizeMatchName(player?.name),
      normalizeMatchName(player?.display),
    ].filter(Boolean);

    for (const candidate of playerCandidates) {
      const match = apiByName.get(candidate);
      if (!match || match.ambiguous || !match.personId) continue;
      changed = true;
      return { ...player, personId: match.personId };
    }

    return player;
  });

  return changed ? nextPlayers : players;
}

function parseRemotePayload(note, key) {
  const parsed = safeParseJson(note || "{}", null);
  if (!parsed) return { updatedAt: 0, value: null };
  if (Array.isArray(parsed)) return { updatedAt: 0, value: parsed };
  if (typeof parsed !== "object") return { updatedAt: 0, value: null };
  const updatedAt = Number(parsed.updatedAt || 0);
  if (parsed[key] != null) return { updatedAt, value: parsed[key] };
  if (parsed.value != null) return { updatedAt, value: parsed.value };
  return { updatedAt, value: parsed };
}

function playersStorageKey(teamScope) {
  return `${PLAYERS_STORAGE_KEY_PREFIX}${teamScope}`;
}

export function loadPregamePlayersPayload(teamScope) {
  if (typeof window === "undefined" || !teamScope) return null;
  const scopedRaw = window.localStorage.getItem(playersStorageKey(teamScope));
  const raw = scopedRaw || (teamScope === "washington" ? window.localStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY) : null);
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (Array.isArray(parsed)) {
    return { updatedAt: 0, players: normalizePregamePlayers(parsed) };
  }
  if (!parsed || typeof parsed !== "object") return null;
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    players: normalizePregamePlayers(parsed.players),
  };
}

export function persistPregamePlayers(teamScope, players, updatedAt = Date.now()) {
  if (typeof window === "undefined" || !teamScope) return;
  window.localStorage.setItem(playersStorageKey(teamScope), JSON.stringify({
    updatedAt,
    players: sortPregamePlayersByLastName(players),
  }));
}

export async function fetchRemotePregamePlayers(teamScope) {
  if (!supabase || !teamScope) return null;
  const gameId = PREGAME_GLOBAL_PLAYERS_GAME_IDS[teamScope];
  if (!gameId) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", gameId)
    .eq("action_number", PREGAME_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  const payload = parseRemotePayload(data?.note, "players");
  return {
    updatedAt: payload.updatedAt,
    players: normalizePregamePlayers(payload.value),
  };
}

export async function saveRemotePregamePlayers(teamScope, players, updatedAt = Date.now()) {
  if (!supabase || !teamScope) return;
  const gameId = PREGAME_GLOBAL_PLAYERS_GAME_IDS[teamScope];
  if (!gameId) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: gameId,
      action_number: PREGAME_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        players: sortPregamePlayersByLastName(players),
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}
