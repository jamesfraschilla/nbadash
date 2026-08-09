import { supabase } from "./supabaseClient.js";
import { readLocalStorage, writeLocalStorage } from "./storage.js";

const TOOL_VAULT_STORAGE_PREFIX = "nba-dashboard:tool-vault:v1:";
const TOOL_VAULT_EVICTION_PREFIXES = [
  "nba-dashboard-season-games:",
  "nba-dashboard-team-season-games:",
  "nba-dashboard:match-ups:",
  "pregame:players:v2:",
  "pregame:players:v1",
];
const TOOL_VAULT_REMOTE_TIMEOUT_MS = 12_000;

export const TOOL_RECORD_TYPES = {
  MATCHUP_GRAPHIC: "matchup_graphic",
  PREGAME_COURT_TIME_GRAPHIC: "pregame_court_time_graphic",
  PERSONNEL_GRAPHIC: "personnel_graphic",
  DEPTH_CHART_GRAPHIC: "depth_chart_graphic",
  ROTATIONS_TOOL: "rotations_tool",
  GAME_ANALYSIS: "game_analysis",
  PREGAME_SCOUTING_PACKET: "pregame_scouting_packet",
  LATE_GAME_FEEDBACK: "late_game_feedback",
  LATE_GAME_RECOMMENDATION: "late_game_recommendation",
  VISUAL_DRILL_PRESET: "visual_drill_preset",
};

function toolVaultKey(userId) {
  return `${TOOL_VAULT_STORAGE_PREFIX}${String(userId || "guest").trim() || "guest"}`;
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id || "").trim();
  if (!id) return null;
  return {
    id,
    type: String(record.type || TOOL_RECORD_TYPES.MATCHUP_GRAPHIC).trim() || TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: String(record.title || "Untitled").trim() || "Untitled",
    payload: record.payload && typeof record.payload === "object" ? record.payload : {},
    createdAt: String(record.createdAt || record.updatedAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || record.createdAt || new Date().toISOString()),
    revision: Math.max(0, Number.isFinite(Number(record.revision)) ? Number(record.revision) : 0),
  };
}

export function listSavedToolRecords(userId) {
  const raw = readLocalStorage(toolVaultKey(userId));
  const parsed = safeParse(raw, []);
  return (Array.isArray(parsed) ? parsed : [])
    .map(normalizeRecord)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

function createRemoteToolRequestSignal(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(message));
  }, TOOL_VAULT_REMOTE_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

async function runRemoteToolRequest(queryBuilder, timeoutMessage) {
  const { signal, cleanup } = createRemoteToolRequestSignal(timeoutMessage);
  try {
    const query = queryBuilder();
    const request = typeof query?.abortSignal === "function"
      ? query.abortSignal(signal)
      : query;
    return await request;
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    cleanup();
  }
}

function evictToolVaultStorageCaches() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const storageKeys = new Set(Object.keys(window.localStorage));
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) storageKeys.add(key);
    }
    [...storageKeys]
      .filter((key) => TOOL_VAULT_EVICTION_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore restrictive browser storage failures.
  }
}

function writeToolVaultRecords(userId, records) {
  const key = toolVaultKey(userId);
  const value = JSON.stringify(records);
  if (writeLocalStorage(key, value)) return true;
  evictToolVaultStorageCaches();
  return writeLocalStorage(key, value);
}

export function getSavedToolRecord(userId, recordId) {
  return listSavedToolRecords(userId).find((record) => record.id === String(recordId || "").trim()) || null;
}

export function saveToolRecord(userId, record) {
  const normalized = normalizeRecord(record);
  if (!normalized) return null;
  const records = listSavedToolRecords(userId);
  const existingIndex = records.findIndex((entry) => entry.id === normalized.id);
  const nextRecords = [...records];
  if (existingIndex >= 0) {
    nextRecords[existingIndex] = {
      ...nextRecords[existingIndex],
      ...normalized,
      createdAt: nextRecords[existingIndex].createdAt || normalized.createdAt,
      revision: Math.max(nextRecords[existingIndex].revision || 0, normalized.revision || 0),
    };
  } else {
    nextRecords.unshift(normalized);
  }
  const saved = existingIndex >= 0 ? nextRecords[existingIndex] : normalized;
  return writeToolVaultRecords(userId, nextRecords) ? saved : null;
}

export function deleteSavedToolRecord(userId, recordId) {
  const nextRecords = listSavedToolRecords(userId).filter((record) => record.id !== String(recordId || "").trim());
  writeToolVaultRecords(userId, nextRecords);
}

export function replaceSavedToolRecords(userId, records) {
  const normalized = (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  writeToolVaultRecords(userId, normalized);
  return normalized;
}

export async function listSavedToolRecordsRemote(userId) {
  if (!userId) return [];
  await requireSupabase();
  const { data, error } = await runRemoteToolRequest(
    () => supabase
      .from("user_tool_records")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false }),
    "Account favorites took too long to load. Check your connection and try again."
  );
  if (error) throw error;
  const records = (data || [])
    .map((row) => normalizeRecord({
      id: row.id,
      type: row.type,
      title: row.title,
      payload: row.payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    }))
    .filter(Boolean);
  return replaceSavedToolRecords(userId, records);
}

export async function getSavedToolRecordRemote(userId, recordId) {
  const normalizedId = String(recordId || "").trim();
  if (!userId || !normalizedId) return null;
  await requireSupabase();
  const { data, error } = await runRemoteToolRequest(
    () => supabase
      .from("user_tool_records")
      .select("*")
      .eq("owner_id", userId)
      .eq("id", normalizedId)
      .maybeSingle(),
    "This saved tool took too long to load. Check your connection and try again."
  );
  if (error) throw error;
  const record = data ? normalizeRecord({
    id: data.id,
    type: data.type,
    title: data.title,
    payload: data.payload,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    revision: data.revision,
  }) : null;
  if (record) saveToolRecord(userId, record);
  else deleteSavedToolRecord(userId, normalizedId);
  return record;
}

export async function saveToolRecordRemote(userId, record) {
  if (!userId) return null;
  await requireSupabase();
  const normalized = normalizeRecord(record);
  if (!normalized) return null;
  const cached = getSavedToolRecord(userId, normalized.id);
  const expectedRevision = Math.max(0, Number(normalized.revision || cached?.revision || 0));
  const payload = {
    id: normalized.id,
    type: normalized.type || TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: normalized.title,
    payload: normalized.payload,
    created_at: normalized.createdAt,
  };
  const { data, error } = await runRemoteToolRequest(
    () => supabase.rpc("save_user_tool_record_atomic", {
      p_record: payload,
      p_expected_revision: expectedRevision,
    }),
    "Saving this favorite took too long. Check your connection and try again."
  );
  if (error) {
    if (error.code === "40001" || String(error.message || "").includes("TOOL_RECORD_CONFLICT")) {
      throw new Error("This saved tool changed in another browser. Reload it before saving again.");
    }
    if (String(error.message || "").includes("Could not find the function")) {
      throw new Error("The latest tool-vault Supabase migration has not been applied.");
    }
    throw error;
  }
  const saved = normalizeRecord({
    id: data.id,
    type: data.type,
    title: data.title,
    payload: data.payload,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    revision: data.revision,
  });
  saveToolRecord(userId, saved);
  return saved;
}

export async function deleteSavedToolRecordRemote(userId, recordId) {
  const normalizedId = String(recordId || "").trim();
  if (!userId || !normalizedId) return;
  await requireSupabase();
  const { data, error } = await runRemoteToolRequest(
    () => supabase
      .from("user_tool_records")
      .delete()
      .eq("owner_id", userId)
      .eq("id", normalizedId)
      .select("id"),
    "Deleting this favorite took too long. Check your connection and try again."
  );
  if (error) throw error;
  if (!Array.isArray(data) || !data.some((row) => row.id === normalizedId)) {
    throw new Error("Supabase did not confirm that the saved record was deleted.");
  }
  deleteSavedToolRecord(userId, normalizedId);
}
