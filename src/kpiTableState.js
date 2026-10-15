import { fetchSharedStateRow, saveSharedStateRow } from "./sharedState.js";

export const KPI_TABLE_SCOPE = "shared_game_kpi_tables";
export const KPI_TABLE_SECTIONS = ["defense", "offense"];
export const KPI_QUARTER_FIELDS = ["q1", "q2", "q3", "q4"];
export const KPI_TABLE_COLUMNS = ["Q1", "Q2", "Q3", "Q4", "Total"];
const EDITABLE_FIELDS = ["label", ...KPI_QUARTER_FIELDS];

function blankRow(section, index) {
  return {
    id: `${section}-${index + 1}`,
    label: "",
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    fieldUpdatedAt: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, 0])),
  };
}

export function createDefaultKpiTablePayload() {
  return {
    version: 1,
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
    version: 1,
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

export function calculateKpiRowTotal(row) {
  const values = KPI_QUARTER_FIELDS.map((field) => String(row?.[field] ?? "").trim());
  if (values.every((value) => value === "")) return "";
  const total = values.reduce((sum, value) => {
    if (!value) return sum;
    const number = Number(value);
    return Number.isFinite(number) ? sum + number : sum;
  }, 0);
  return String(Number(total.toFixed(6)));
}

export async function fetchSharedKpiTables(gameId) {
  const row = await fetchSharedStateRow(KPI_TABLE_SCOPE, String(gameId || ""));
  return normalizeKpiTablePayload(row?.payload);
}

export async function saveSharedKpiTables(gameId, localPayload, maxAttempts = 4) {
  const scopeKey = String(gameId || "");
  if (!scopeKey) return normalizeKpiTablePayload(localPayload);
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const current = await fetchSharedStateRow(KPI_TABLE_SCOPE, scopeKey);
      const payload = mergeKpiTablePayload(current?.payload, localPayload);
      const saved = await saveSharedStateRow({
        scopeType: KPI_TABLE_SCOPE,
        scopeKey,
        payload,
        expectedVersion: current?.version || null,
      });
      return normalizeKpiTablePayload(saved?.payload || payload);
    } catch (error) {
      lastError = error;
      if (error?.code !== "SHARED_STATE_CONFLICT") throw error;
    }
  }
  throw lastError || new Error("Unable to save shared KPI tables after multiple retries.");
}
