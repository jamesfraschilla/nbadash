import { parseRefereeAssignments } from "./parser.ts";

const ASSIGNMENTS_URL = "https://official.nba.com/referee-assignments/";
const CACHE_TTL_MS = 5 * 60 * 1000;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
let cache: { fetchedAt: number; assignments: ReturnType<typeof parseRefereeAssignments> } | null = null;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return jsonResponse(200, { assignments: cache.assignments, fetchedAt: new Date(cache.fetchedAt).toISOString() });
    }
    const response = await fetch(ASSIGNMENTS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Referee Assignments)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`NBA assignments request failed (${response.status}).`);
    const assignments = parseRefereeAssignments(await response.text());
    if (!assignments.length) throw new Error("The NBA assignments page returned no crews.");
    cache = { fetchedAt: now, assignments };
    return jsonResponse(200, { assignments, fetchedAt: new Date(now).toISOString() });
  } catch (error) {
    if (cache?.assignments.length) {
      return jsonResponse(200, {
        assignments: cache.assignments,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        stale: true,
      });
    }
    return jsonResponse(502, { error: error instanceof Error ? error.message : "Unable to load referee assignments." });
  }
});
