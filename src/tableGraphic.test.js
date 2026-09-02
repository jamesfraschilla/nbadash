import assert from "node:assert/strict";
import test from "node:test";
import {
  TABLE_GRAPHIC_DEFAULT_COLUMNS,
  TABLE_GRAPHIC_DEFAULT_ROWS,
  addTableGraphicColumn,
  addTableGraphicRow,
  createTableGraphicDraft,
  getTableGraphicExportRows,
  normalizeTableGraphicDraft,
  removeTableGraphicColumn,
  removeTableGraphicRow,
} from "./tableGraphic.js";

test("table graphic draft defaults to 18 rows, two columns, and a team row", () => {
  const draft = createTableGraphicDraft();
  assert.equal(draft.rows.length, TABLE_GRAPHIC_DEFAULT_ROWS);
  assert.equal(draft.columns.length, TABLE_GRAPHIC_DEFAULT_COLUMNS);
  assert.equal(draft.title, "");
  assert.equal(draft.columns[0].header, "PLAYER");
  assert.equal(draft.rows[17].label, "TEAM");
});

test("table graphic normalization preserves the saved title", () => {
  const draft = createTableGraphicDraft();
  draft.title = "Paint Touches";
  assert.equal(normalizeTableGraphicDraft(draft).title, "Paint Touches");
});

test("table graphic normalization preserves editable spaces in title and headers", () => {
  const draft = createTableGraphicDraft();
  draft.title = "Paint ";
  draft.columns[1].header = "2 Min ";
  draft.rows[0].values[0] = "10 ";
  const normalized = normalizeTableGraphicDraft(draft);
  assert.equal(normalized.title, "Paint ");
  assert.equal(normalized.columns[1].header, "2 Min ");
  assert.equal(normalized.rows[0].values[0], "10 ");
});

test("table graphic export drops blank player rows and keeps the team row", () => {
  const draft = createTableGraphicDraft();
  draft.rows[0].playerId = "1";
  draft.rows[0].values[0] = "12";
  const rows = getTableGraphicExportRows(draft, [{ personId: "1", fullName: "Alex Sarr" }]);
  assert.deepEqual(rows.map((row) => row.label), ["Alex Sarr", "TEAM"]);
});

test("table graphic row and column controls preserve rectangular data", () => {
  const source = createTableGraphicDraft();
  source.title = "Paint Touches";
  const draft = addTableGraphicColumn(addTableGraphicRow(source));
  assert.equal(draft.columns.length, 3);
  assert.equal(draft.rows.length, 19);
  assert.equal(draft.title, "Paint Touches");
  assert.equal(draft.rows.at(-1).label, "TEAM");
  assert.equal(draft.rows.every((row) => row.values.length === 2), true);

  const trimmed = removeTableGraphicColumn(removeTableGraphicRow(draft));
  assert.equal(trimmed.columns.length, 2);
  assert.equal(trimmed.rows.length, 18);
  assert.equal(trimmed.title, "Paint Touches");
  assert.equal(trimmed.rows.every((row) => row.values.length === 1), true);
  assert.equal(trimmed.rows.at(-1).label, "TEAM");
});
