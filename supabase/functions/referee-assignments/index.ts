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

function normalizeName(value: string) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function firstNameKey(value: string) {
  return normalizeName(String(value || "").trim().split(/\s+/)[0] || "");
}

async function attachStableIdentities(storage: ReturnType<typeof storageClient>, assignments: ReturnType<typeof parseRefereeAssignments>) {
  if (!storage || !assignments.length) return assignments;
  const { data, error } = await storage.from("nba_official_identities")
    .select("official_id,current_name,current_jersey_number,name_aliases");
  if (error || !data?.length) return assignments;

  const matches = new Map<string, typeof data[number] | null>();
  const numberAndFirstNameMatches = new Map<string, typeof data[number] | null>();
  data.forEach((identity) => {
    [identity.current_name, ...(identity.name_aliases || [])].forEach((name) => {
      const key = normalizeName(name);
      if (!key) return;
      if (!matches.has(key)) matches.set(key, identity);
      else if (matches.get(key)?.official_id !== identity.official_id) matches.set(key, null);
    });
    if (identity.current_jersey_number && identity.current_name) {
      const key = `${identity.current_jersey_number}|${firstNameKey(identity.current_name)}`;
      if (!numberAndFirstNameMatches.has(key)) numberAndFirstNameMatches.set(key, identity);
      else if (numberAndFirstNameMatches.get(key)?.official_id !== identity.official_id) numberAndFirstNameMatches.set(key, null);
    }
  });

  const observations: Array<Record<string, string>> = [];
  const hydrated = assignments.map((assignment) => {
    const next = { ...assignment };
    ([
      ["crewChief", "crewChiefNumber", "crewChiefId"],
      ["referee", "refereeNumber", "refereeId"],
      ["umpire", "umpireNumber", "umpireId"],
      ["alternate", "alternateNumber", "alternateId"],
    ] as const).forEach(([nameField, numberField, idField]) => {
      const identity = matches.get(normalizeName(next[nameField]))
        || numberAndFirstNameMatches.get(`${next[numberField]}|${firstNameKey(next[nameField])}`);
      if (!identity) return;
      next[idField] = identity.official_id;
      observations.push({
        officialId: identity.official_id,
        name: next[nameField],
        jerseyNumber: next[numberField],
        observedOn: easternDate(),
      });
    });
    return next;
  });
  if (observations.length) {
    const { error: observeError } = await storage.rpc("observe_nba_official_identities", { observations });
    if (observeError) console.warn("Unable to update referee identity observations.", observeError.message);
  }
  return hydrated;
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

  const requestUrl = new URL(request.url);
  const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
  const requestedDate = requestUrl.searchParams.get("date") || "";
  try {
    const now = Date.now();
    const storage = storageClient();
    if (requestedDate && requestedDate !== easternDate() && storage) {
      const { data } = await storage.from("rotations_shared_state").select("payload")
        .eq("scope_type", "referee_assignments").eq("scope_key", requestedDate).maybeSingle();
      const payload = data?.payload;
      if (Array.isArray(payload?.assignments) && payload.assignments.length) {
        return jsonResponse(200, payload, 86400);
      }
      return jsonResponse(404, { error: `No referee assignment snapshot is stored for ${requestedDate}.` }, 0);
    }
    if (!forceRefresh && !cache && storage) {
      const { data } = await storage.from("rotations_shared_state").select("payload")
        .eq("scope_type", "referee_assignments").eq("scope_key", "latest").maybeSingle();
      const payload = data?.payload;
      if (payload?.date === easternDate() && Array.isArray(payload.assignments) && payload.assignments.length) {
        cache = {
          fetchedAt: Date.parse(payload.fetchedAt),
          assignments: await attachStableIdentities(storage, payload.assignments),
        };
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
    const assignments = await attachStableIdentities(storage, parseRefereeAssignments(html));
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
      const payload = { date: easternDate(), assignments, fetchedAt: new Date(now).toISOString() };
      const { error } = await storage.from("rotations_shared_state").upsert([
        { scope_type: "referee_assignments", scope_key: "latest", payload },
        { scope_type: "referee_assignments", scope_key: easternDate(), payload },
      ], { onConflict: "scope_type,scope_key" });
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
