import { fetchSharedStateRow, saveSharedStateRow } from "./sharedState.js";

export const KPI_TABLE_SCOPE = "shared_game_kpi_tables";
export const KPI_TABLE_SECTIONS = ["defense", "offense"];
export const KPI_QUARTER_FIELDS = ["q1", "q2", "q3", "q4"];
export const KPI_TABLE_COLUMNS = ["Q1", "Q2", "Q3", "Q4", "Total"];
export const KPI_VALUE_FIELDS = [...KPI_QUARTER_FIELDS, "total"];
const EDITABLE_FIELDS = ["label", ...KPI_VALUE_FIELDS];

function blankRow(section, index) {
  return {
    id: `${section}-${index + 1}`,
    label: "",
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    total: "",
    fieldUpdatedAt: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, 0])),
  };
}

export function createDefaultKpiTablePayload() {
  return {
    version: 2,
    updatedAt: 0,
    defense: Array.from({ length: 3 }, (_, index) => blankRow("defense", index)),
    offense: Array.from({ length: 3 }, (_, index) => blankRow("offense", index)),
  };
}

function normalizeRow(row, section, index, fallbackUpdatedAt) {
  const fallback = blankRow(section, index);
  return {
    id: fallback.id,
    ...Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, String(row?.[field] ?? "")])),
    fieldUpdatedAt: Object.fromEntries(EDITABLE_FIELDS.map((field) => [
      field,
      Number(row?.fieldUpdatedAt?.[field] || fallbackUpdatedAt || 0),
    ])),
  };
}

export function normalizeKpiTablePayload(raw) {
  const updatedAt = Number(raw?.updatedAt || 0);
  const defaults = createDefaultKpiTablePayload();
  return {
    version: 2,
    updatedAt,
    ...Object.fromEntries(KPI_TABLE_SECTIONS.map((section) => [
      section,
      defaults[section].map((_, index) => normalizeRow(raw?.[section]?.[index], section, index, updatedAt)),
    ])),
  };
}

export function mergeKpiTablePayload(leftRaw, rightRaw) {
  const left = normalizeKpiTablePayload(leftRaw);
  const right = normalizeKpiTablePayload(rightRaw);
  const merged = createDefaultKpiTablePayload();

  KPI_TABLE_SECTIONS.forEach((section) => {
    merged[section] = left[section].map((leftRow, index) => {
      const rightRow = right[section][index];
      const row = { id: leftRow.id, fieldUpdatedAt: {} };
      EDITABLE_FIELDS.forEach((field) => {
        const leftTime = Number(leftRow.fieldUpdatedAt[field] || 0);
        const rightTime = Number(rightRow.fieldUpdatedAt[field] || 0);
        const useRight = rightTime > leftTime;
        row[field] = useRight ? rightRow[field] : leftRow[field];
        row.fieldUpdatedAt[field] = Math.max(leftTime, rightTime);
      });
      return row;
    });
  });
  merged.updatedAt = Math.max(
    left.updatedAt,
    right.updatedAt,
    ...KPI_TABLE_SECTIONS.flatMap((section) => merged[section].flatMap((row) => Object.values(row.fieldUpdatedAt))),
  );
  return merged;
}

export function updateKpiTableField(payload, section, rowIndex, field, value, timestamp = Date.now()) {
  const normalized = normalizeKpiTablePayload(payload);
  if (!KPI_TABLE_SECTIONS.includes(section) || !EDITABLE_FIELDS.includes(field) || !normalized[section][rowIndex]) {
    return normalized;
  }
  return {
    ...normalized,
    updatedAt: timestamp,
    [section]: normalized[section].map((row, index) => index === rowIndex ? {
      ...row,
      [field]: String(value ?? ""),
      fieldUpdatedAt: { ...row.fieldUpdatedAt, [field]: timestamp },
    } : row),
  };
}

export async function fetchSharedKpiTables(gameId) {
  return (await fetchSharedKpiTableState(gameId)).payload;
}

export async function fetchSharedKpiTableState(gameId) {
  const scopeKey = String(gameId || "");
  const row = scopeKey ? await fetchSharedStateRow(KPI_TABLE_SCOPE, scopeKey) : null;
  return { payload: normalizeKpiTablePayload(row?.payload), version: row?.version || null };
}

export async function saveSharedKpiTableDraft(gameId, localPayload, expectedVersion) {
  const scopeKey = String(gameId || "");
  const payload = normalizeKpiTablePayload(localPayload);
  if (!scopeKey) return { payload, version: null };
  const saved = await saveSharedStateRow({
    scopeType: KPI_TABLE_SCOPE,
    scopeKey,
    payload,
    expectedVersion,
  });
  if (!saved) throw new Error("Shared storage is unavailable.");
  return { payload: normalizeKpiTablePayload(saved.payload || payload), version: saved.version || null };
}
