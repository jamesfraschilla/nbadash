import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AUTH_STORAGE_KEY = "nba-dashboard-auth";
const STORAGE_EVICTION_PREFIXES = [
  "nba-dashboard-season-games:",
  "nba-dashboard:match-ups:",
  "pregame:players:v2:",
  "pregame:players:v1",
];

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars are missing. Highlights will be disabled.");
}

const browserStorage = typeof window !== "undefined"
  ? {
    getItem(key) {
      return window.localStorage.getItem(key) ?? window.sessionStorage?.getItem(key) ?? null;
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        const isQuotaError = error?.name === "QuotaExceededError"
          || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
          || error?.code === 22
          || error?.code === 1014;

        if (!isQuotaError) throw error;

        STORAGE_EVICTION_PREFIXES.forEach((prefix) => {
          Object.keys(window.localStorage)
            .filter((storageKey) => storageKey.startsWith(prefix))
            .forEach((storageKey) => window.localStorage.removeItem(storageKey));
        });

        try {
          window.localStorage.setItem(key, value);
          return;
        } catch (retryError) {
          if (window.sessionStorage) {
            window.sessionStorage.setItem(key, value);
            return;
          }
          throw retryError;
        }
      }
    },
    removeItem(key) {
      window.localStorage.removeItem(key);
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    },
  }
  : undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
      storage: browserStorage,
    },
  })
  : null;
