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

export async function requestPregameScoutingPacket({
  teamId,
  mode,
  gameCount,
  startDate,
  endDate,
}) {
  requireSupabase();
  const accessToken = await getCurrentAccessToken();
  const { data, error } = await supabase.functions.invoke("pregame-scouting", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      accessToken,
      teamId,
      mode,
      gameCount,
      startDate,
      endDate,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to generate pre-game scouting packet.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
