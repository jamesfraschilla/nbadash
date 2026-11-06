import { fetchSharedStateRow, saveSharedStateRow } from "./sharedState.js";

// Dedicated namespace; never reads or writes Rotations charts or roster state.
export const CAPITAL_CITY_ATC_SCOPE = "capital_city_atc_workspace";
export const ATC_MAX_TEXT = 20000;
export const ATC_MAX_STROKES = 1000;
export const ATC_MAX_POINTS = 50000;

export function capitalCityAtcKey(gameId, section) {
  if (!/^\d{10}$/.test(String(gameId)) || !["text", "drawing"].includes(section)) throw new Error("Invalid ATC game or section.");
  return `${gameId}:${section}`;
}

export function normalizeAtcPayload(section, raw) {
  if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) throw new Error("Unable to read saved workspace data safely.");
  if (raw?.version != null && raw.version !== 1) throw new Error("This workspace uses an unsupported version. Reload the app before editing.");
  if (section === "text") {
    const text = raw?.text ?? "";
    if (typeof text !== "string" || text.length > ATC_MAX_TEXT) throw new Error("Unable to read the saved ATC text safely.");
    return { version: 1, text };
  }
  if (section !== "drawing") throw new Error("Invalid workspace section.");
  const strokes = raw?.strokes ?? [];
  if (!Array.isArray(strokes) || strokes.length > ATC_MAX_STROKES) throw new Error("Drawing is too large to edit safely.");
  let points = 0;
  return { version: 1, strokes: strokes.map(stroke => {
    points += stroke?.points?.length || 0;
    if (!["pen", "eraser"].includes(stroke?.tool) || !/^#[0-9a-f]{6}$/i.test(stroke?.color)
      || !Number.isFinite(stroke?.size) || stroke.size < 2 || stroke.size > 18
      || !Array.isArray(stroke.points) || !stroke.points.length || points > ATC_MAX_POINTS) {
      throw new Error("Drawing data is invalid or too large. Existing saved content has not been changed.");
    }
    return { tool: stroke.tool, color: stroke.color, size: stroke.size, points: stroke.points.map(point => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        throw new Error("Unable to read the saved drawing safely.");
      }
      return { x: point.x, y: point.y };
    }) };
  }) };
}

export async function fetchCapitalCityAtcSection(gameId, section) {
  const row = await fetchSharedStateRow(CAPITAL_CITY_ATC_SCOPE, capitalCityAtcKey(gameId, section));
  return { payload: normalizeAtcPayload(section, row?.payload), version: row?.version || null };
}

export async function saveCapitalCityAtcSection(gameId, section, payload, version) {
  const row = await saveSharedStateRow({ scopeType: CAPITAL_CITY_ATC_SCOPE,
    scopeKey: capitalCityAtcKey(gameId, section), payload: normalizeAtcPayload(section, payload), expectedVersion: version });
  if (!row) throw new Error("The save could not be confirmed. Your edits are still here; please retry.");
  return { payload: normalizeAtcPayload(section, row.payload), version: row.version };
}
