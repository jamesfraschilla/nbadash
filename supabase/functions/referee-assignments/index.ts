import { parseRefereeAssignments } from "./parser.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ASSIGNMENTS_URL = "https://official.nba.com/referee-assignments/";
const CACHE_TTL_MS = 5 * 60 * 1000;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
let cache: { fetchedAt: number; assignments: ReturnType<typeof parseRefereeAssignments> } | null = null;
const easternDate = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
function storageClient() {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function jsonResponse(status: number, payload: Record<string, unknown>, maxAge = 300) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": status >= 400 || maxAge === 0 ? "no-store" : `public, max-age=${maxAge}`,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed." });

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const now = Date.now();
    const storage = storageClient();
    if (!forceRefresh && !cache && storage) {
      const { data } = await storage.from("rotations_shared_state").select("payload")
        .eq("scope_type", "referee_assignments").eq("scope_key", "latest").maybeSingle();
      const payload = data?.payload;
      if (payload?.date === easternDate() && Array.isArray(payload.assignments) && payload.assignments.length) {
        cache = { fetchedAt: Date.parse(payload.fetchedAt), assignments: payload.assignments };
      }
    }
    if (cache && easternDate(new Date(cache.fetchedAt)) !== easternDate()) cache = null;
    if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return jsonResponse(200, { assignments: cache.assignments, fetchedAt: new Date(cache.fetchedAt).toISOString() });
    }
    const response = await fetch(ASSIGNMENTS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Referee Assignments)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`NBA assignments request failed (${response.status}).`);
    const html = await response.text();
    const dateMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i);
    if (dateMatch && easternDate(new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]} 12:00:00 GMT-0400`)) !== easternDate()) {
      throw new Error("The NBA assignments page is not dated today.");
    }
    const assignments = parseRefereeAssignments(html);
    if (!assignments.length) {
      const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
      const diagnostic = {
        htmlLength: html.length,
        tableCount: (html.match(/<table\b/gi) || []).length,
        tableRowCount: rows.length,
        assignmentShapedRowCount: rows.filter((row) => (row.match(/<td\b/gi) || []).length >= 4).length,
      };
      return jsonResponse(502, {
        error: "The NBA assignments page returned no crews.",
        diagnostic,
      }, 0);
    }
    cache = { fetchedAt: now, assignments };
    if (storage) {
      const { error } = await storage.from("rotations_shared_state").upsert({ scope_type: "referee_assignments", scope_key: "latest",
        payload: { date: easternDate(), assignments, fetchedAt: new Date(now).toISOString() } }, { onConflict: "scope_type,scope_key" });
      if (error) throw new Error("Unable to persist today's referee assignments.");
    }
    return jsonResponse(200, { assignments, fetchedAt: new Date(now).toISOString() }, forceRefresh ? 0 : 300);
  } catch (error) {
    if (!forceRefresh && cache?.assignments.length && easternDate(new Date(cache.fetchedAt)) === easternDate()) {
      return jsonResponse(200, {
        assignments: cache.assignments,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        stale: true,
      });
    }
    return jsonResponse(502, { error: error instanceof Error ? error.message : "Unable to load referee assignments." });
  }
});
