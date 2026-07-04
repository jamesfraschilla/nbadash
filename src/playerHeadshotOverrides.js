import { supabase } from "./supabaseClient.js";

// Manual player headshot overrides keyed by NBA personId or a manual roster key.
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
const PLAYER_HEADSHOT_UPLOAD_FORMATS = {
  "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
  "image/png": { contentType: "image/png", extension: "png" },
  "image/webp": { contentType: "image/webp", extension: "webp" },
};
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

export function normalizePlayerHeadshotKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const personMatch = /^(?:person:)?(\d+)$/i.exec(raw);
  if (personMatch) return personMatch[1];
  if (/^manual:/i.test(raw)) {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function storagePathPrefixForHeadshotKey(value) {
  return normalizePlayerHeadshotKey(value)
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "player";
}

export function getPlayerHeadshotUploadFormat(value) {
  const normalized = String(value || "").toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpg") return PLAYER_HEADSHOT_UPLOAD_FORMATS["image/jpeg"];
  return PLAYER_HEADSHOT_UPLOAD_FORMATS[normalized] || PLAYER_HEADSHOT_UPLOAD_FORMATS["image/jpeg"];
}

export function sanitizePlayerHeadshotRecord(record, fallbackKey = "") {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const key = normalizePlayerHeadshotKey(record.key || record.personId || fallbackKey);
  if (!key) return null;
  const bucket = String(record.bucket || PLAYER_HEADSHOT_BUCKET).trim();
  const path = String(record.path || "").trim();
  const url = String(record.url || "").trim() || buildSupabaseStoragePublicUrl(bucket, path);
  if (!url && !path) return null;
  const contentType = String(record.contentType || "").trim();
  const sanitizedRecord = {
    key,
    personId: key,
    label: String(record.label || "").trim(),
    originalFileName: String(record.originalFileName || "").trim(),
    bucket,
    path,
    url,
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
  if (contentType) sanitizedRecord.contentType = getPlayerHeadshotUploadFormat(contentType).contentType;
  return sanitizedRecord;
}

export function sanitizePlayerHeadshotState(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return {};
  const rawRecords = rawState.records && typeof rawState.records === "object"
    ? rawState.records
    : rawState;
  const records = {};
  Object.entries(rawRecords || {}).forEach(([key, record]) => {
    const sanitized = sanitizePlayerHeadshotRecord(record, key);
    if (sanitized) records[sanitized.key] = sanitized;
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
  const safeKey = normalizePlayerHeadshotKey(personId);
  if (!safeKey) return [];
  const uploadedRecord = readStoredPlayerHeadshotOverrides()[safeKey];
  return [
    ...normalizePlayerHeadshotOverrides(uploadedRecord?.url, basePath),
    ...normalizePlayerHeadshotOverrides(playerHeadshotOverrides[safeKey], basePath),
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
    if (error) throw error;
    if (!error && data?.payload && typeof data.payload === "object") {
      return sanitizePlayerHeadshotState(data.payload);
    }
  }
  if (!userId) return null;
  return null;
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
    return payload;
  }
  if (!userId) return null;
  return null;
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
  headshotKey = "",
  label = "",
  originalFileName = "",
  blob,
  contentType = "",
}) {
  const safeHeadshotKey = normalizePlayerHeadshotKey(headshotKey || personId);
  if (!safeHeadshotKey) throw new Error("Missing player ID or headshot key.");
  if (!blob) throw new Error("Choose an image to upload.");
  if (!supabase) throw new Error("Supabase is not configured.");

  const format = getPlayerHeadshotUploadFormat(contentType || blob?.type);
  const path = `${storagePathPrefixForHeadshotKey(safeHeadshotKey)}/${Date.now()}-headshot.${format.extension}`;
  const upload = await supabase.storage
    .from(PLAYER_HEADSHOT_BUCKET)
    .upload(path, blob, {
      contentType: format.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upload.error) throw upload.error;

  return {
    key: safeHeadshotKey,
    personId: safeHeadshotKey,
    label: String(label || "").trim(),
    originalFileName: String(originalFileName || "").trim(),
    bucket: PLAYER_HEADSHOT_BUCKET,
    path,
    contentType: format.contentType,
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
