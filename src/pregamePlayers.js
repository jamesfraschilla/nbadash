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
      }))
      .filter((player) => player.name && player.display)
  );
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
