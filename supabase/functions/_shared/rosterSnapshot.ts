import { createClient } from "npm:@supabase/supabase-js@2";

const SNAPSHOT_REQUEST_TIMEOUT_MS = 1_500;

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readRosterSnapshot(league: "nba" | "gleague") {
  const client = getAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("roster_feed_snapshots")
    .select("league,season,payload,fetched_at")
    .eq("league", league)
    .abortSignal(AbortSignal.timeout(SNAPSHOT_REQUEST_TIMEOUT_MS))
    .maybeSingle();
  if (error) return null;
  const payload = data?.payload && typeof data.payload === "object" ? data.payload : null;
  return payload ? {
    ...payload,
    season: String(data.season || payload.season || ""),
    fetchedAt: String(data.fetched_at || payload.fetchedAt || ""),
  } : null;
}

export async function writeRosterSnapshot(
  league: "nba" | "gleague",
  season: string,
  payload: Record<string, unknown>,
) {
  const client = getAdminClient();
  if (!client) return false;
  const fetchedAt = String(payload.fetchedAt || new Date().toISOString());
  const { error } = await client
    .from("roster_feed_snapshots")
    .upsert({
      league,
      season,
      payload,
      fetched_at: fetchedAt,
    }, { onConflict: "league" })
    .abortSignal(AbortSignal.timeout(SNAPSHOT_REQUEST_TIMEOUT_MS));
  return !error;
}
