import { supabase } from "./supabaseClient.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

async function getCurrentAccessToken() {
  requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || "";
}

export async function requestGameAnalysis({ gameId, game, minutesData, range }) {
  requireSupabase();
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) {
    throw new Error("Your session has expired. Sign in again, then rerun Analysis.");
  }
  const { data, error } = await supabase.functions.invoke("nba-game-analysis", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      accessToken,
      gameId,
      game,
      minutesData,
      range,
    },
  });

  if (error) {
    if (/non-2xx status code/i.test(String(error.message || ""))) {
      throw new Error("Analysis request was rejected by the server. Sign out and back in, then try again.");
    }
    throw new Error(error.message || "Unable to generate analysis.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
