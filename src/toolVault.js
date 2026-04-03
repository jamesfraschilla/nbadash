import { readLocalStorage, writeLocalStorage } from "./storage.js";

const TOOL_VAULT_STORAGE_PREFIX = "nba-dashboard:tool-vault:v1:";

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
    type: String(record.type || "matchup_graphic").trim() || "matchup_graphic",
    title: String(record.title || "Untitled").trim() || "Untitled",
    payload: record.payload && typeof record.payload === "object" ? record.payload : {},
    createdAt: String(record.createdAt || record.updatedAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || record.createdAt || new Date().toISOString()),
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
    };
  } else {
    nextRecords.unshift(normalized);
  }
  writeLocalStorage(toolVaultKey(userId), JSON.stringify(nextRecords));
  return normalized;
}

export function deleteSavedToolRecord(userId, recordId) {
  const nextRecords = listSavedToolRecords(userId).filter((record) => record.id !== String(recordId || "").trim());
  writeLocalStorage(toolVaultKey(userId), JSON.stringify(nextRecords));
}

