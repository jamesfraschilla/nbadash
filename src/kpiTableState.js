import { fetchSharedStateRow, saveSharedStateRow } from "./sharedState.js";

export const KPI_TABLE_SCOPE = "shared_game_kpi_tables";
const KPI_TEMPLATE_KEY = "wizards:defaults";
export const KPI_TABLE_SECTIONS = ["defense", "offense"];
export const KPI_QUARTER_FIELDS = ["q1", "q2", "q3", "q4"];
export const KPI_TABLE_COLUMNS = ["Q1", "Q2", "Q3", "Q4", "Total"];
export const KPI_VALUE_FIELDS = [...KPI_QUARTER_FIELDS, "total"];
export const KPI_TABLE_COLORS = ["default", "green", "yellow", "red"];
const EDITABLE_FIELDS = ["label", ...KPI_VALUE_FIELDS, "color"];

function blankRow(section, index) {
  return {
    id: `${section}-${index + 1}`,
    label: "",
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    total: "",
    color: "default",
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
    color: KPI_TABLE_COLORS.includes(row?.color) ? row.color : "default",
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
  if (field === "color" && !KPI_TABLE_COLORS.includes(value)) return normalized;
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
  if (row) return { payload: normalizeKpiTablePayload(row.payload), version: row.version };
  const template = scopeKey ? await fetchSharedStateRow(KPI_TABLE_SCOPE, KPI_TEMPLATE_KEY) : null;
  return { payload: kpiTableTemplate(template?.payload), version: null };
}

export function kpiTableTemplate(raw) {
  const payload = normalizeKpiTablePayload(raw);
  KPI_TABLE_SECTIONS.forEach((section) => {
    payload[section].forEach((row) => {
      KPI_VALUE_FIELDS.forEach((field) => {
        row[field] = "";
        row.fieldUpdatedAt[field] = 0;
      });
    });
  });
  return payload;
}

async function saveKpiTableTemplate(payload) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await fetchSharedStateRow(KPI_TABLE_SCOPE, KPI_TEMPLATE_KEY);
    const merged = kpiTableTemplate(mergeKpiTablePayload(current?.payload, kpiTableTemplate(payload)));
    if (current && JSON.stringify(kpiTableTemplate(current.payload)) === JSON.stringify(merged)) return;
    try {
      const saved = await saveSharedStateRow({ scopeType: KPI_TABLE_SCOPE, scopeKey: KPI_TEMPLATE_KEY, payload: merged, expectedVersion: current?.version || null });
      if (!saved) throw new Error("Shared storage is unavailable.");
      return;
    } catch (error) {
      if (error?.code !== "SHARED_STATE_CONFLICT" || attempt === 3) throw error;
    }
  }
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
  let defaultsError = "";
  try {
    await saveKpiTableTemplate(payload);
  } catch (error) {
    defaultsError = `This game's KPIs were saved, but future-game defaults could not be updated. ${error?.message || "Please save again to retry."}`;
  }
  return { payload: normalizeKpiTablePayload(saved.payload || payload), version: saved.version || null, defaultsError };
}
