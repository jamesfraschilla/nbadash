import { createClient } from "@supabase/supabase-js";

const supabaseEnv = import.meta.env || {};
const supabaseUrl = supabaseEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = supabaseEnv.VITE_SUPABASE_ANON_KEY;
const AUTH_STORAGE_KEY = "nba-dashboard-auth";
const STORAGE_EVICTION_PREFIXES = [
  "nba-dashboard-season-games:v2:",
  "nba-dashboard-team-season-games:v2:",
  "nba-dashboard-season-games:",
  "nba-dashboard-team-season-games:",
  "nba-dashboard:match-ups:",
  "pregame:players:v2:",
  "pregame:players:v1",
];

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars are missing. Highlights will be disabled.");
}

function safeListStorageKeys(storage) {
  if (!storage) return [];
  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
  } catch {
    return [];
  }
}

function safeReadStorage(storage, key) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemoveStorage(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore restrictive browser storage failures.
  }
}

function parseStoredAuthValue(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    const currentSession = parsed?.currentSession;
    const expiresAt = Number(
      currentSession?.expires_at
      || currentSession?.expiresAt
      || parsed?.expires_at
      || parsed?.expiresAt
      || 0
    );
    return {
      rawValue,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    };
  } catch {
    return {
      rawValue,
      expiresAt: 0,
    };
  }
}

const browserStorage = typeof window !== "undefined"
  ? {
    getItem(key) {
      const localValue = safeReadStorage(window.localStorage, key);
      const sessionValue = safeReadStorage(window.sessionStorage, key);
      const localEntry = parseStoredAuthValue(localValue);
      const sessionEntry = parseStoredAuthValue(sessionValue);

      if (localEntry && sessionEntry) {
        return sessionEntry.expiresAt > localEntry.expiresAt
          ? sessionEntry.rawValue
          : localEntry.rawValue;
      }

      return localEntry?.rawValue ?? sessionEntry?.rawValue ?? null;
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
        safeRemoveStorage(window.sessionStorage, key);
      } catch (error) {
        const isQuotaError = error?.name === "QuotaExceededError"
          || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
          || error?.code === 22
          || error?.code === 1014;

        if (!isQuotaError) throw error;

        STORAGE_EVICTION_PREFIXES.forEach((prefix) => {
          Object.keys(window.localStorage)
            .filter((storageKey) => storageKey.startsWith(prefix))
            .forEach((storageKey) => safeRemoveStorage(window.localStorage, storageKey));
        });

        try {
          window.localStorage.setItem(key, value);
          safeRemoveStorage(window.sessionStorage, key);
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
      safeRemoveStorage(window.localStorage, key);
      safeRemoveStorage(window.sessionStorage, key);
    },
  }
  : undefined;

export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    safeListStorageKeys(storage)
      .filter((key) => key === AUTH_STORAGE_KEY || key.includes("auth-token"))
      .forEach((key) => safeRemoveStorage(storage, key));
  });
}

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

export const supabaseFunctionConfig = {
  url: supabaseUrl || "",
  anonKey: supabaseAnonKey || "",
};
