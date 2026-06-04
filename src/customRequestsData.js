import { supabase } from "./supabaseClient.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseAnonKey,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/custom-requests`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      accessToken,
      prompt,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error
      || payload?.message
      || `Custom request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return payload;
}
