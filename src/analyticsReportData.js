import { supabase } from "./supabaseClient.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireSupabase() {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }
}

async function getCurrentAccessToken() {
  requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || "";
}

export async function requestNbaAnalyticsReport({ teamId, season, seasonType = "Regular Season", lastNGames = 10 }) {
  requireSupabase();
  const accessToken = await getCurrentAccessToken();
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseAnonKey,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/nba-analytics-report`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      teamId,
      season,
      seasonType,
      lastNGames,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Analytics report failed (${response.status}).`);
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return payload;
}
