import { supabase } from "./supabaseClient.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

export async function requestGameAnalysis({ gameId, game, minutesData, range }) {
  requireSupabase();
  const { data, error } = await supabase.functions.invoke("game-analysis", {
    body: {
      gameId,
      game,
      minutesData,
      range,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to generate analysis.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
