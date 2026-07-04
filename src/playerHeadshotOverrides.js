import { supabase } from "./supabaseClient.js";
import { getSavedToolRecordRemote, saveToolRecordRemote } from "./toolVault.js";

// Manual player headshot overrides keyed by NBA personId.
// For source-controlled images, add files under public/player-headshots/
// and use a relative path like "player-headshots/1642066.png".
// Values can be a single URL/path or an ordered array of URL/path candidates.
export const playerHeadshotOverrides = {};

export const PLAYER_HEADSHOT_STORAGE_KEY = "player_headshot_overrides_v1";
export const PLAYER_HEADSHOT_CHANGE_EVENT = "player-headshots-updated";
export const PLAYER_HEADSHOT_BUCKET = "player-headshots";
export const PLAYER_HEADSHOT_REMOTE_RECORD_ID = "shared-player-headshots";
export const PLAYER_HEADSHOT_REMOTE_RECORD_TYPE = "player_headshots";

const PLAYER_HEADSHOT_SHARED_TABLE = "rotations_shared_state";
const PLAYER_HEADSHOT_SHARED_SCOPE_TYPE = "shared_player_headshots";
const PLAYER_HEADSHOT_SHARED_SCOPE_KEY = "global";
let inMemoryUploadedPlayerHeadshots = {};
let playerHeadshotCacheSyncBlocked = false;

function normalizePlayerHeadshotOverrideUrl(value, basePath = "/nbadash/") {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(?:https?:|data:|blob:)/i.test(url) || url.startsWith("/")) return url;
  return `${String(basePath || "/").replace(/\/?$/, "/")}${url.replace(/^\/+/, "")}`;
}

function buildSupabaseStoragePublicUrl(bucket, path) {
  if (!supabase || !bucket || !path) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return String(data?.publicUrl || "").trim();
}

function sanitizePersonId(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

export function sanitizePlayerHeadshotRecord(record, fallbackPersonId = "") {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const personId = sanitizePersonId(record.personId || fallbackPersonId);
  if (!personId) return null;
  const bucket = String(record.bucket || PLAYER_HEADSHOT_BUCKET).trim();
  const path = String(record.path || "").trim();
  const url = String(record.url || "").trim() || buildSupabaseStoragePublicUrl(bucket, path);
  if (!url && !path) return null;
  return {
    personId,
    label: String(record.label || "").trim(),
    originalFileName: String(record.originalFileName || "").trim(),
    bucket,
    path,
    url,
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

export function sanitizePlayerHeadshotState(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return {};
  const rawRecords = rawState.records && typeof rawState.records === "object"
    ? rawState.records
    : rawState;
  const records = {};
  Object.entries(rawRecords || {}).forEach(([personId, record]) => {
    const sanitized = sanitizePlayerHeadshotRecord(record, personId);
    if (sanitized) records[sanitized.personId] = sanitized;
  });
  return records;
}

export function readStoredPlayerHeadshotOverrides() {
  if (typeof window === "undefined") return { ...inMemoryUploadedPlayerHeadshots };
  if (playerHeadshotCacheSyncBlocked) {
    return { ...inMemoryUploadedPlayerHeadshots };
  }
  try {
    const raw = window.localStorage.getItem(PLAYER_HEADSHOT_STORAGE_KEY);
    if (!raw) return { ...inMemoryUploadedPlayerHeadshots };
    inMemoryUploadedPlayerHeadshots = sanitizePlayerHeadshotState(JSON.parse(raw));
    return { ...inMemoryUploadedPlayerHeadshots };
  } catch {
    return { ...inMemoryUploadedPlayerHeadshots };
  }
}

export function cacheStoredPlayerHeadshotOverrides(records) {
  inMemoryUploadedPlayerHeadshots = sanitizePlayerHeadshotState(records);
  if (typeof window === "undefined") return { ok: true, records: { ...inMemoryUploadedPlayerHeadshots } };
  try {
    window.localStorage.setItem(
      PLAYER_HEADSHOT_STORAGE_KEY,
      JSON.stringify({ records: inMemoryUploadedPlayerHeadshots })
    );
    playerHeadshotCacheSyncBlocked = false;
    return { ok: true, records: { ...inMemoryUploadedPlayerHeadshots } };
  } catch (error) {
    playerHeadshotCacheSyncBlocked = true;
    return { ok: false, error, records: { ...inMemoryUploadedPlayerHeadshots } };
  }
}

export function broadcastPlayerHeadshotChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAYER_HEADSHOT_CHANGE_EVENT));
}

export function normalizePlayerHeadshotOverrides(value, basePath = "/nbadash/") {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((url) => normalizePlayerHeadshotOverrideUrl(url, basePath))
    .filter(Boolean);
}

export function resolvePlayerHeadshotOverrideUrls(personId, basePath = "/nbadash/") {
  const safePersonId = String(personId || "").trim();
  if (!safePersonId) return [];
  const uploadedRecord = readStoredPlayerHeadshotOverrides()[safePersonId];
  return [
    ...normalizePlayerHeadshotOverrides(uploadedRecord?.url, basePath),
    ...normalizePlayerHeadshotOverrides(playerHeadshotOverrides[safePersonId], basePath),
  ];
}

export async function loadRemotePlayerHeadshotState(userId) {
  if (supabase) {
    const { data, error } = await supabase
      .from(PLAYER_HEADSHOT_SHARED_TABLE)
      .select("payload")
      .eq("scope_type", PLAYER_HEADSHOT_SHARED_SCOPE_TYPE)
      .eq("scope_key", PLAYER_HEADSHOT_SHARED_SCOPE_KEY)
      .maybeSingle();
    if (!error && data?.payload && typeof data.payload === "object") {
      return sanitizePlayerHeadshotState(data.payload);
    }
  }
  if (!userId) return null;
  const record = await getSavedToolRecordRemote(userId, PLAYER_HEADSHOT_REMOTE_RECORD_ID);
  if (!record?.payload || typeof record.payload !== "object") return null;
  return sanitizePlayerHeadshotState(record.payload);
}

export async function saveRemotePlayerHeadshotState(userId, records) {
  const sanitizedRecords = sanitizePlayerHeadshotState(records);
  const payload = { records: sanitizedRecords };
  if (supabase) {
    const { error } = await supabase.from(PLAYER_HEADSHOT_SHARED_TABLE).upsert(
      {
        scope_type: PLAYER_HEADSHOT_SHARED_SCOPE_TYPE,
        scope_key: PLAYER_HEADSHOT_SHARED_SCOPE_KEY,
        payload,
      },
      { onConflict: "scope_type,scope_key" }
    );
    if (error) throw error;
  }
  if (!userId) return null;
  return saveToolRecordRemote(userId, {
    id: PLAYER_HEADSHOT_REMOTE_RECORD_ID,
    type: PLAYER_HEADSHOT_REMOTE_RECORD_TYPE,
    title: "Player Headshots",
    payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function syncRemotePlayerHeadshotState(userId) {
  const remoteRecords = await loadRemotePlayerHeadshotState(userId);
  if (!remoteRecords) return null;
  cacheStoredPlayerHeadshotOverrides(remoteRecords);
  broadcastPlayerHeadshotChange();
  return remoteRecords;
}

export async function uploadPlayerHeadshotAsset({
  personId,
  label = "",
  originalFileName = "",
  blob,
}) {
  const safePersonId = sanitizePersonId(personId);
  if (!safePersonId) throw new Error("Missing player ID.");
  if (!blob) throw new Error("Choose an image to upload.");
  if (!supabase) throw new Error("Supabase is not configured.");

  const path = `${safePersonId}/${Date.now()}-headshot.jpg`;
  const upload = await supabase.storage
    .from(PLAYER_HEADSHOT_BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (upload.error) throw upload.error;

  return {
    personId: safePersonId,
    label: String(label || "").trim(),
    originalFileName: String(originalFileName || "").trim(),
    bucket: PLAYER_HEADSHOT_BUCKET,
    path,
    url: buildSupabaseStoragePublicUrl(PLAYER_HEADSHOT_BUCKET, path),
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteUploadedPlayerHeadshotAsset(record) {
  if (!supabase || !record || typeof record !== "object") return;
  const bucket = String(record.bucket || PLAYER_HEADSHOT_BUCKET).trim();
  const path = String(record.path || "").trim();
  if (bucket && path) {
    await supabase.storage.from(bucket).remove([path]).catch(() => {});
  }
}
