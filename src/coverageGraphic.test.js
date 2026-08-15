import assert from "node:assert/strict";
import test from "node:test";
import {
  COVERAGE_MAX_COLUMNS,
  COVERAGE_MIN_COLUMNS,
  buildEmptyCoverageSlots,
  coverageColumnHasContent,
  getCoverageExportColumnCount,
  hydrateCoveragePayload,
  serializeCoverageSlots,
} from "./coverageGraphic.js";

test("coverage drafts default to three columns and six normalized spaces", () => {
  const slots = buildEmptyCoverageSlots();
  assert.equal(slots.length, 6);
  assert.equal(slots[0].id, "coverage-1-1");
  assert.equal(slots[5].id, "coverage-3-2");
  assert.equal(hydrateCoveragePayload({}).columnCount, COVERAGE_MAX_COLUMNS);
});

test("coverage export collapses to two columns when the third column is empty", () => {
  const slots = buildEmptyCoverageSlots();
  slots[0] = { ...slots[0], title: "P/R", iconKey: "vol-1" };
  slots[2] = { ...slots[2], title: "DHO + C&S", iconKey: "war" };

  assert.equal(coverageColumnHasContent(slots, 2), false);
  assert.equal(getCoverageExportColumnCount(slots, COVERAGE_MAX_COLUMNS), COVERAGE_MIN_COLUMNS);

  slots[4] = { ...slots[4], title: "Misc" };
  assert.equal(coverageColumnHasContent(slots, 2), true);
  assert.equal(getCoverageExportColumnCount(slots, COVERAGE_MAX_COLUMNS), COVERAGE_MAX_COLUMNS);
});

test("coverage payload hydration preserves saved text and icon fields", () => {
  const hydrated = hydrateCoveragePayload({
    league: "gleague",
    logoTeamId: "1612709928",
    columnCount: 2,
    slots: [
      { column: 0, row: 0, title: "P/R", subtitle: "5", iconKey: "vol-1" },
      { id: "coverage-2-2", title: "1-4", iconKey: "red" },
    ],
  });

  assert.equal(hydrated.league, "gleague");
  assert.equal(hydrated.logoTeamId, "1612709928");
  assert.equal(hydrated.columnCount, COVERAGE_MIN_COLUMNS);
  assert.deepEqual(serializeCoverageSlots(hydrated.slots).filter((slot) => slot.title || slot.subtitle || slot.iconKey), [
    { id: "coverage-1-1", column: 0, row: 0, title: "P/R", subtitle: "5", iconKey: "vol-1" },
    { id: "coverage-2-2", column: 1, row: 1, title: "1-4", subtitle: "", iconKey: "red" },
  ]);
});
