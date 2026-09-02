import { supabase, supabaseFunctionConfig } from "./supabaseClient.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const SHADOW_LEASE_TTL_MS = 10_000;
const SHADOW_LEASE_PREFIX = "nba-dash:game-live-state-shadow:";
const SHADOW_TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function createTimeoutSignal(signal, timeoutMs, message = "Game state cache request timed out.") {
  const controller = new AbortController();
  let timeoutId = null;

  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abort();
  } else if (signal) {
    signal.addEventListener("abort", abort, { once: true });
  }

  if (timeoutMs > 0) {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort(new DOMException(message, "TimeoutError"));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", abort);
    },
  };
}

async function getAccessToken() {
  if (!supabase) return "";
  const sessionResult = await supabase.auth.getSession().catch(() => ({ data: null }));
  return sessionResult?.data?.session?.access_token || "";
}

async function invokeGameLiveState(body, options = {}) {
  if (!supabase || !supabaseFunctionConfig.url || !supabaseFunctionConfig.anonKey) {
    return { skipped: true, reason: "supabase-not-configured" };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { skipped: true, reason: "auth-session-unavailable" };
  }

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const { signal, cleanup } = createTimeoutSignal(options.signal, timeoutMs);

  try {
    const response = await fetch(`${supabaseFunctionConfig.url}/functions/v1/game-live-state`, {
      method: "POST",
      headers: {
        apikey: supabaseFunctionConfig.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Unable to update game state cache (${response.status}).`);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  } finally {
    cleanup();
  }
}

function countPlayers(boxScoreTeam) {
  return Array.isArray(boxScoreTeam?.players) ? boxScoreTeam.players.length : 0;
}

function countMinutesStints(minutesData) {
  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods : [];
  return periods.reduce((sum, period) => sum + (Array.isArray(period?.stints) ? period.stints.length : 0), 0);
}

export function buildGameLiveStateShadowKey(game, minutesData = null) {
  if (!game?.gameId && !game?.awayTeam && !game?.homeTeam) return "";
  const boxScore = game?.boxScore || {};
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods : [];
  return [
    game?.gameId || "",
    game?.gameStatus || "",
    game?.gameStatusText || "",
    game?.period || "",
    game?.gameClock || "",
    game?.awayTeam?.teamId || "",
    game?.awayTeam?.score ?? "",
    game?.homeTeam?.teamId || "",
    game?.homeTeam?.score ?? "",
    actions.length,
    countPlayers(boxScore.away) + countPlayers(boxScore.home),
    periods.length,
    countMinutesStints(minutesData),
  ].join("|");
}

function getStorage() {
  try {
    return globalThis.window?.localStorage || null;
  } catch {
    return null;
  }
}

export function claimGameLiveStateShadowLease(gameId, nowMs = Date.now()) {
  const storage = getStorage();
  if (!storage || !gameId) return true;
  const key = `${SHADOW_LEASE_PREFIX}${gameId}`;
  const expiresAt = nowMs + SHADOW_LEASE_TTL_MS;
  try {
    const current = JSON.parse(storage.getItem(key) || "null");
    if (current?.owner && current.owner !== SHADOW_TAB_ID && Number(current.expiresAt) > nowMs) {
      return false;
    }
    storage.setItem(key, JSON.stringify({ owner: SHADOW_TAB_ID, expiresAt }));
    return true;
  } catch {
    return true;
  }
}

export async function getGameLiveStateSnapshot(gameId, options = {}) {
  if (!gameId) return null;
  const data = await invokeGameLiveState({
    operation: "get",
    gameId,
  }, options);
  return data?.snapshot || null;
}

export async function upsertGameLiveStateShadow({
  gameId,
  game,
  minutesData = null,
  signal,
  timeoutMs,
}) {
  if (!gameId || !game) return { skipped: true, reason: "missing-game" };
  if (!claimGameLiveStateShadowLease(gameId)) return { skipped: true, reason: "shadow-lease-held" };
  return invokeGameLiveState({
    operation: "upsert",
    gameId,
    game,
    minutesData,
  }, { signal, timeoutMs });
}
