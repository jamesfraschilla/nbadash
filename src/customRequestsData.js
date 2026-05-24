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

export async function requestCustomDashboardRequest({ prompt }) {
  requireSupabase();
  const accessToken = await getCurrentAccessToken();
  const { data, error } = await supabase.functions.invoke("custom-requests", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      accessToken,
      prompt,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to complete the custom request.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
