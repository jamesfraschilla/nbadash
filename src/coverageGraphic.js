export const COVERAGE_ROW_COUNT = 2;
export const COVERAGE_MIN_COLUMNS = 2;
export const COVERAGE_MAX_COLUMNS = 3;
export const DEFAULT_COVERAGE_COLUMN_COUNT = 3;

export function buildCoverageSlot(columnIndex, rowIndex, overrides = {}) {
  return {
    id: `coverage-${columnIndex + 1}-${rowIndex + 1}`,
    column: columnIndex,
    row: rowIndex,
    title: String(overrides.title || "").trim(),
    subtitle: String(overrides.subtitle || "").trim(),
    iconKey: String(overrides.iconKey || "").trim(),
  };
}

export function buildEmptyCoverageSlots() {
  return Array.from({ length: COVERAGE_MAX_COLUMNS }, (_, columnIndex) => (
    Array.from({ length: COVERAGE_ROW_COUNT }, (__, rowIndex) => buildCoverageSlot(columnIndex, rowIndex))
  )).flat();
}

export function normalizeCoverageColumnCount(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (parsed === COVERAGE_MIN_COLUMNS) return COVERAGE_MIN_COLUMNS;
  return DEFAULT_COVERAGE_COLUMN_COUNT;
}

function normalizeCoverageSlot(slot, columnIndex, rowIndex) {
  const source = slot && typeof slot === "object" ? slot : {};
  return buildCoverageSlot(columnIndex, rowIndex, {
    title: source.title,
    subtitle: source.subtitle,
    iconKey: source.iconKey,
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
    title: slot.title,
    subtitle: slot.subtitle,
    iconKey: slot.iconKey,
  }));
}

export function coverageSlotHasContent(slot) {
  return Boolean(
    String(slot?.title || "").trim() ||
    String(slot?.subtitle || "").trim() ||
    String(slot?.iconKey || "").trim()
  );
}

export function coverageColumnHasContent(slots, columnIndex) {
  return (Array.isArray(slots) ? slots : []).some((slot) => (
    Number(slot?.column) === columnIndex && coverageSlotHasContent(slot)
  ));
}

export function getCoverageExportColumnCount(slots, columnCount) {
  const normalizedCount = normalizeCoverageColumnCount(columnCount);
  if (normalizedCount <= COVERAGE_MIN_COLUMNS) return COVERAGE_MIN_COLUMNS;
  return coverageColumnHasContent(slots, 2) ? COVERAGE_MAX_COLUMNS : COVERAGE_MIN_COLUMNS;
}

export function hydrateCoveragePayload(payload) {
  return {
    league: String(payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba",
    logoTeamId: String(payload?.logoTeamId || "").trim(),
    columnCount: normalizeCoverageColumnCount(payload?.columnCount),
    slots: hydrateCoverageSlots(payload?.slots),
  };
}
