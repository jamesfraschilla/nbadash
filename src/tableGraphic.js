export const TABLE_GRAPHIC_DEFAULT_ROWS = 18;
export const TABLE_GRAPHIC_DEFAULT_COLUMNS = 2;
export const TABLE_GRAPHIC_MIN_ROWS = 2;
export const TABLE_GRAPHIC_MAX_ROWS = 34;
export const TABLE_GRAPHIC_MIN_COLUMNS = 2;
export const TABLE_GRAPHIC_MAX_COLUMNS = 8;
export const TABLE_GRAPHIC_TEAM_ROW_ID = "team";

function createId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

export function createTableGraphicDraft({
  rowCount = TABLE_GRAPHIC_DEFAULT_ROWS,
  columnCount = TABLE_GRAPHIC_DEFAULT_COLUMNS,
} = {}) {
  const safeRowCount = Math.min(TABLE_GRAPHIC_MAX_ROWS, Math.max(TABLE_GRAPHIC_MIN_ROWS, Number(rowCount) || TABLE_GRAPHIC_DEFAULT_ROWS));
  const safeColumnCount = Math.min(TABLE_GRAPHIC_MAX_COLUMNS, Math.max(TABLE_GRAPHIC_MIN_COLUMNS, Number(columnCount) || TABLE_GRAPHIC_DEFAULT_COLUMNS));
  return {
    title: "",
    rows: Array.from({ length: safeRowCount }, (_, index) => ({
      id: index === safeRowCount - 1 ? TABLE_GRAPHIC_TEAM_ROW_ID : createId("row", index),
      playerId: "",
      label: index === safeRowCount - 1 ? "TEAM" : "",
      values: Array.from({ length: safeColumnCount - 1 }, () => ""),
    })),
    columns: [
      { id: "player", header: "PLAYER" },
      ...Array.from({ length: safeColumnCount - 1 }, (_, index) => ({
        id: createId("stat", index),
        header: "",
      })),
    ],
  };
}

export function normalizeTableGraphicDraft(draft) {
  const sourceRows = Array.isArray(draft?.rows) ? draft.rows : [];
  const sourceColumns = Array.isArray(draft?.columns) ? draft.columns : [];
  const columnCount = Math.min(
    TABLE_GRAPHIC_MAX_COLUMNS,
    Math.max(TABLE_GRAPHIC_MIN_COLUMNS, sourceColumns.length || TABLE_GRAPHIC_DEFAULT_COLUMNS)
  );
  const rowCount = Math.min(
    TABLE_GRAPHIC_MAX_ROWS,
    Math.max(TABLE_GRAPHIC_MIN_ROWS, sourceRows.length || TABLE_GRAPHIC_DEFAULT_ROWS)
  );
  const columns = Array.from({ length: columnCount }, (_, index) => {
    if (index === 0) return { id: "player", header: "PLAYER" };
    const source = sourceColumns[index] || {};
    return {
      id: String(source.id || createId("stat", index - 1)).trim() || createId("stat", index - 1),
      header: String(source.header || ""),
    };
  });
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const source = sourceRows[index] || {};
    const isTeamRow = index === rowCount - 1 || source.id === TABLE_GRAPHIC_TEAM_ROW_ID;
    return {
      id: isTeamRow ? TABLE_GRAPHIC_TEAM_ROW_ID : String(source.id || createId("row", index)).trim(),
      playerId: isTeamRow ? "" : String(source.playerId || "").trim(),
      label: isTeamRow ? "TEAM" : String(source.label || "").trim(),
      values: Array.from({ length: columnCount - 1 }, (_, valueIndex) => String(source.values?.[valueIndex] || "")),
    };
  });
  return {
    title: String(draft?.title || ""),
    rows,
    columns,
  };
}

export function getTableGraphicExportRows(draft, roster = []) {
  const normalized = normalizeTableGraphicDraft(draft);
  const rosterById = new Map((Array.isArray(roster) ? roster : []).map((player) => [String(player.personId || "").trim(), player]));
  return normalized.rows
    .map((row, index) => {
      const isTeam = index === normalized.rows.length - 1 || row.id === TABLE_GRAPHIC_TEAM_ROW_ID;
      const player = row.playerId ? rosterById.get(row.playerId) : null;
      const label = isTeam
        ? "TEAM"
        : String(player?.fullName || row.label || "").trim();
      return {
        ...row,
        isTeam,
        label,
      };
    })
    .filter((row) => row.isTeam || row.label);
}

export function getTableGraphicExportColumns(draft) {
  return normalizeTableGraphicDraft(draft).columns;
}

export function addTableGraphicColumn(draft) {
  const normalized = normalizeTableGraphicDraft(draft);
  if (normalized.columns.length >= TABLE_GRAPHIC_MAX_COLUMNS) return normalized;
  return {
    title: normalized.title,
    columns: [
      ...normalized.columns,
      { id: createId("stat", normalized.columns.length - 1), header: "" },
    ],
    rows: normalized.rows.map((row) => ({
      ...row,
      values: [...row.values, ""],
    })),
  };
}

export function removeTableGraphicColumn(draft) {
  const normalized = normalizeTableGraphicDraft(draft);
  if (normalized.columns.length <= TABLE_GRAPHIC_MIN_COLUMNS) return normalized;
  return {
    title: normalized.title,
    columns: normalized.columns.slice(0, -1),
    rows: normalized.rows.map((row) => ({
      ...row,
      values: row.values.slice(0, -1),
    })),
  };
}

export function addTableGraphicRow(draft) {
  const normalized = normalizeTableGraphicDraft(draft);
  if (normalized.rows.length >= TABLE_GRAPHIC_MAX_ROWS) return normalized;
  const valueCount = normalized.columns.length - 1;
  const playerRows = normalized.rows.slice(0, -1);
  const teamRow = normalized.rows[normalized.rows.length - 1] || {
    id: TABLE_GRAPHIC_TEAM_ROW_ID,
    playerId: "",
    label: "TEAM",
    values: Array.from({ length: valueCount }, () => ""),
  };
  return {
    title: normalized.title,
    columns: normalized.columns,
    rows: [
      ...playerRows,
      { id: createId("row", playerRows.length), playerId: "", label: "", values: Array.from({ length: valueCount }, () => "") },
      { ...teamRow, id: TABLE_GRAPHIC_TEAM_ROW_ID, playerId: "", label: "TEAM" },
    ],
  };
}

export function removeTableGraphicRow(draft) {
  const normalized = normalizeTableGraphicDraft(draft);
  if (normalized.rows.length <= TABLE_GRAPHIC_MIN_ROWS) return normalized;
  return {
    title: normalized.title,
    columns: normalized.columns,
    rows: [
      ...normalized.rows.slice(0, -2),
      { ...normalized.rows[normalized.rows.length - 1], id: TABLE_GRAPHIC_TEAM_ROW_ID, playerId: "", label: "TEAM" },
    ],
  };
}
