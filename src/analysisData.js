import { supabase, supabaseFunctionConfig } from "./supabaseClient.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

function createTimeoutSignal(signal, timeoutMs) {
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
      controller.abort(new DOMException("Analysis request timed out.", "TimeoutError"));
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

async function invokeGameAnalysis(body, options = {}) {
  requireSupabase();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 45_000;
  const { signal, cleanup } = createTimeoutSignal(options.signal, timeoutMs);

  try {
    const sessionResult = await supabase.auth.getSession().catch(() => ({ data: null }));
    const accessToken = sessionResult?.data?.session?.access_token || supabaseFunctionConfig.anonKey;
    const response = await fetch(`${supabaseFunctionConfig.url}/functions/v1/game-analysis`, {
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
      throw new Error(data?.error || `Unable to generate analysis (${response.status}).`);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } finally {
    cleanup();
  }
}

export async function requestGameAnalysis({ gameId, game, minutesData, range, cache = null, signal, timeoutMs }) {
  return invokeGameAnalysis({
    gameId,
    game,
    minutesData,
    range,
    cache,
  }, { signal, timeoutMs });
}

export async function listCachedGameAnalyses(gameId, options = {}) {
  if (!gameId) return [];
  const data = await invokeGameAnalysis({
    operation: "list-cached-segments",
    gameId,
  }, options);
  return Array.isArray(data?.segments) ? data.segments : [];
}
