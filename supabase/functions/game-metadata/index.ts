const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const MAX_GAME_IDS = 200;
const REQUEST_DEADLINE_MS = 15_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
  });
}

async function mapSettledWithConcurrency<T, R>(values: T[], worker: (value: T) => Promise<R>, concurrency: number) {
  const results: PromiseSettledResult<R>[] = Array(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const gameIds = [...new Set(
      (Array.isArray(body.gameIds) ? body.gameIds : [])
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d+$/.test(value))
    )].slice(0, MAX_GAME_IDS);
    if (!gameIds.length) return jsonResponse(200, { games: {}, errors: [] });

    const globalController = new AbortController();
    const deadlineId = setTimeout(() => globalController.abort("global-deadline"), REQUEST_DEADLINE_MS);
    let results: PromiseSettledResult<{ gameId: string; game: unknown }>[];
    try {
      results = await mapSettledWithConcurrency(gameIds, async (gameId) => {
        if (globalController.signal.aborted) throw new Error("Batch deadline reached");
        const response = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}`, {
          headers: { Accept: "application/json" },
          signal: globalController.signal,
        });
        if (!response.ok) throw new Error(`Game request failed (${response.status})`);
        return { gameId, game: await response.json() };
      }, 8);
    } finally {
      clearTimeout(deadlineId);
    }

    const games: Record<string, unknown> = {};
    const errors: Array<{ gameId: string; message: string }> = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") games[result.value.gameId] = result.value.game;
      else errors.push({
        gameId: gameIds[index],
        message: result.reason instanceof Error ? result.reason.message : "unknown",
      });
    });
    return jsonResponse(200, { games, errors, partial: errors.length > 0 });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Unable to load game metadata" });
  }
});
