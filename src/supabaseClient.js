import { createClient } from "@supabase/supabase-js";

const supabaseEnv = import.meta.env || {};
const supabaseUrl = supabaseEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = supabaseEnv.VITE_SUPABASE_ANON_KEY;
const AUTH_STORAGE_KEY = "nba-dashboard-auth";
const AUTH_DATABASE_NAME = "nba-dashboard-auth";
const AUTH_DATABASE_STORE = "sessions";
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

export function selectStoredAuthValue(localValue, sessionValue) {
  // localStorage is shared across tabs. A sessionStorage fallback belongs to
  // one tab and can hold an older refresh token even if it expires later.
  return parseStoredAuthValue(localValue)?.rawValue
    ?? parseStoredAuthValue(sessionValue)?.rawValue
    ?? null;
}

function openAuthDatabase() {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try {
      request = window.indexedDB.open(AUTH_DATABASE_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(AUTH_DATABASE_STORE)) {
        request.result.createObjectStore(AUTH_DATABASE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readIndexedAuthValue(key) {
  const database = await openAuthDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    let request;
    try {
      const transaction = database.transaction(AUTH_DATABASE_STORE, "readonly");
      request = transaction.objectStore(AUTH_DATABASE_STORE).get(key);
    } catch {
      database.close();
      resolve(null);
      return;
    }
    request.onsuccess = () => {
      const value = typeof request.result === "string" ? request.result : null;
      database.close();
      resolve(value);
    };
    request.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

async function writeIndexedAuthValue(key, value) {
  const database = await openAuthDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(AUTH_DATABASE_STORE, "readwrite");
      transaction.objectStore(AUTH_DATABASE_STORE).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        resolve(true);
      };
      transaction.onerror = () => {
        database.close();
        resolve(false);
      };
      transaction.onabort = () => {
        database.close();
        resolve(false);
      };
    } catch {
      database.close();
      resolve(false);
    }
  });
}

async function removeIndexedAuthValue(key) {
  const database = await openAuthDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    try {
      const transaction = database.transaction(AUTH_DATABASE_STORE, "readwrite");
      transaction.objectStore(AUTH_DATABASE_STORE).delete(key);
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
        database.close();
        resolve();
      };
    } catch {
      database.close();
      resolve();
    }
  });
}

const browserStorage = typeof window !== "undefined"
  ? {
    async getItem(key) {
      const localValue = safeReadStorage(window.localStorage, key);
      const indexedValue = await readIndexedAuthValue(key);
      const sessionValue = safeReadStorage(window.sessionStorage, key);
      const sharedValue = selectStoredAuthValue(localValue, indexedValue);
      if (sharedValue) {
        if (!localValue) {
          try {
            window.localStorage.setItem(key, sharedValue);
          } catch {
            // IndexedDB remains the durable shared-tab copy.
          }
        }
        if (!indexedValue) void writeIndexedAuthValue(key, sharedValue);
        return sharedValue;
      }
      return selectStoredAuthValue(null, sessionValue);
    },
    async setItem(key, value) {
      let localSaved = false;
      try {
        window.localStorage.setItem(key, value);
        localSaved = true;
        safeRemoveStorage(window.sessionStorage, key);
      } catch (error) {
        const isQuotaError = error?.name === "QuotaExceededError"
          || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
          || error?.code === 22
          || error?.code === 1014;

        if (isQuotaError) {
          STORAGE_EVICTION_PREFIXES.forEach((prefix) => {
            safeListStorageKeys(window.localStorage)
              .filter((storageKey) => storageKey.startsWith(prefix))
              .forEach((storageKey) => safeRemoveStorage(window.localStorage, storageKey));
          });

          try {
            window.localStorage.setItem(key, value);
            localSaved = true;
            safeRemoveStorage(window.sessionStorage, key);
          } catch {
            // IndexedDB is the shared-tab fallback when localStorage stays full.
          }
        }
      }
      const indexedSaved = await writeIndexedAuthValue(key, value);
      if (localSaved || indexedSaved) {
        safeRemoveStorage(window.sessionStorage, key);
        return;
      }
      if (window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
      throw new Error("Unable to persist the sign-in session in this browser.");
    },
    async removeItem(key) {
      safeRemoveStorage(window.localStorage, key);
      safeRemoveStorage(window.sessionStorage, key);
      await removeIndexedAuthValue(key);
    },
  }
  : undefined;

export async function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    safeListStorageKeys(storage)
      .filter((key) => key === AUTH_STORAGE_KEY || key.includes("auth-token"))
      .forEach((key) => safeRemoveStorage(storage, key));
  });
  await removeIndexedAuthValue(AUTH_STORAGE_KEY);
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
