export const COVERAGE_ROW_COUNT = 2;
export const COVERAGE_MIN_COLUMNS = 2;
export const COVERAGE_MAX_COLUMNS = 3;
export const DEFAULT_COVERAGE_COLUMN_COUNT = 3;
export const DEFAULT_COVERAGE_COLUMN_HEADERS = Object.freeze(["P/R", "DHO + C&S", "MISC"]);

export function buildCoverageSlot(columnIndex, rowIndex, overrides = {}) {
  return {
    id: `coverage-${columnIndex + 1}-${rowIndex + 1}`,
    column: columnIndex,
    row: rowIndex,
    subtitle: String(overrides.subtitle ?? "").trim(),
    iconKey: String(overrides.iconKey ?? "").trim(),
  };
}

export function buildEmptyCoverageSlots() {
  return Array.from({ length: COVERAGE_MAX_COLUMNS }, (_, columnIndex) => (
    Array.from({ length: COVERAGE_ROW_COUNT }, (__, rowIndex) => buildCoverageSlot(columnIndex, rowIndex))
)).flat();
}

export function buildDefaultCoverageSlots() {
  return buildEmptyCoverageSlots().map((slot) => {
    if (slot.column === 0 && slot.row === 0) {
      return { ...slot, subtitle: "5", iconKey: "vol-1" };
    }
    if (slot.column === 0 && slot.row === 1) {
      return { ...slot, subtitle: "1-4", iconKey: "red" };
    }
    return slot;
  });
}

export function buildDefaultCoverageColumnHeaders() {
  return [...DEFAULT_COVERAGE_COLUMN_HEADERS];
}

export function normalizeCoverageColumnCount(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (parsed === COVERAGE_MIN_COLUMNS) return COVERAGE_MIN_COLUMNS;
  return DEFAULT_COVERAGE_COLUMN_COUNT;
}

function normalizeCoverageSlot(slot, columnIndex, rowIndex) {
  const source = slot && typeof slot === "object" ? slot : {};
  return buildCoverageSlot(columnIndex, rowIndex, {
    subtitle: source.subtitle ?? (rowIndex > 0 ? source.title : ""),
    iconKey: source.iconKey,
  });
}

function getLegacyColumnHeader(slots, columnIndex) {
  const incomingSlots = Array.isArray(slots) ? slots : [];
  const matchingSlot = incomingSlots.find((slot) => (
    Number(slot?.column) === columnIndex &&
    Number(slot?.row) === 0 &&
    String(slot?.title || "").trim()
  )) || incomingSlots.find((slot) => (
    String(slot?.id || "") === `coverage-${columnIndex + 1}-1` &&
    String(slot?.title || "").trim()
  ));
  return String(matchingSlot?.title || "").trim();
}

export function hydrateCoverageColumnHeaders(value, legacySlots = []) {
  const hasSavedHeaders = Array.isArray(value);
  return Array.from({ length: COVERAGE_MAX_COLUMNS }, (_, columnIndex) => {
    const savedHeader = hasSavedHeaders ? value[columnIndex] : undefined;
    const normalizedSavedHeader = typeof savedHeader === "object" && savedHeader
      ? String(savedHeader.title || savedHeader.label || "").trim()
      : String(savedHeader || "").trim();
    if (hasSavedHeaders) return normalizedSavedHeader;

    if (Array.isArray(legacySlots) && legacySlots.length) {
      return getLegacyColumnHeader(legacySlots, columnIndex);
    }

    return DEFAULT_COVERAGE_COLUMN_HEADERS[columnIndex] || "";
  });
}

export function hydrateCoverageSlots(value) {
  const incomingSlots = Array.isArray(value) ? value : [];
  return buildEmptyCoverageSlots().map((emptySlot) => {
    const savedSlot = incomingSlots.find((slot) => (
      Number(slot?.column) === emptySlot.column && Number(slot?.row) === emptySlot.row
    )) || incomingSlots.find((slot) => String(slot?.id || "") === emptySlot.id);
    return normalizeCoverageSlot(savedSlot, emptySlot.column, emptySlot.row);
  });
}

export function serializeCoverageSlots(value) {
  return hydrateCoverageSlots(value).map((slot) => ({
    id: slot.id,
    column: slot.column,
    row: slot.row,
    subtitle: slot.subtitle,
    iconKey: slot.iconKey,
  }));
}

export function serializeCoverageColumnHeaders(value) {
  return hydrateCoverageColumnHeaders(value).map((header) => String(header || "").trim());
}

export function coverageSlotHasContent(slot) {
  return Boolean(
    String(slot?.subtitle || "").trim() ||
    String(slot?.iconKey || "").trim()
  );
}

export function coverageColumnHasContent(slots, columnIndex, columnHeaders = []) {
  const header = Array.isArray(columnHeaders) ? columnHeaders[columnIndex] : "";
  return (Array.isArray(slots) ? slots : []).some((slot) => (
    Number(slot?.column) === columnIndex && coverageSlotHasContent(slot)
  )) || Boolean(String(header || "").trim());
}

export function getCoverageExportColumnCount(slots, columnCount, columnHeaders = []) {
  const normalizedCount = normalizeCoverageColumnCount(columnCount);
  if (normalizedCount <= COVERAGE_MIN_COLUMNS) return COVERAGE_MIN_COLUMNS;
  return coverageColumnHasContent(slots, 2, columnHeaders) ? COVERAGE_MAX_COLUMNS : COVERAGE_MIN_COLUMNS;
}

export function hydrateCoveragePayload(payload) {
  return {
    league: String(payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba",
    logoTeamId: String(payload?.logoTeamId || "").trim(),
    columnCount: normalizeCoverageColumnCount(payload?.columnCount),
    columnHeaders: hydrateCoverageColumnHeaders(payload?.columnHeaders, payload?.slots),
    slots: hydrateCoverageSlots(payload?.slots),
  };
}
