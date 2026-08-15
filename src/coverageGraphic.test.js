import assert from "node:assert/strict";
import test from "node:test";
import {
  COVERAGE_MAX_COLUMNS,
  COVERAGE_MIN_COLUMNS,
  buildDefaultCoverageColumnHeaders,
  buildDefaultCoverageSlots,
  buildEmptyCoverageSlots,
  coverageColumnHasContent,
  getCoverageExportColumnCount,
  hydrateCoveragePayload,
  serializeCoverageColumnHeaders,
  serializeCoverageSlots,
} from "./coverageGraphic.js";

test("coverage drafts default to three headers, six spaces, and the first column coverages", () => {
  const slots = buildDefaultCoverageSlots();
  assert.equal(slots.length, 6);
  assert.equal(slots[0].id, "coverage-1-1");
  assert.equal(slots[0].subtitle, "5");
  assert.equal(slots[0].iconKey, "vol-1");
  assert.equal(slots[1].subtitle, "1-4");
  assert.equal(slots[1].iconKey, "red");
  assert.equal(slots[5].id, "coverage-3-2");
  assert.deepEqual(buildDefaultCoverageColumnHeaders(), ["P/R", "DHO + C&S", "MISC"]);
  const hydrated = hydrateCoveragePayload({});
  assert.equal(hydrated.columnCount, COVERAGE_MAX_COLUMNS);
  assert.deepEqual(hydrated.columnHeaders, ["P/R", "DHO + C&S", "MISC"]);
});

test("coverage export collapses to two columns when the third column is empty", () => {
  const slots = buildEmptyCoverageSlots();
  slots[0] = { ...slots[0], subtitle: "5", iconKey: "vol-1" };
  slots[2] = { ...slots[2], subtitle: "Peterson / Hinson", iconKey: "war" };
  const twoColumnHeaders = ["P/R", "DHO + C&S", ""];

  assert.equal(coverageColumnHasContent(slots, 2, twoColumnHeaders), false);
  assert.equal(getCoverageExportColumnCount(slots, COVERAGE_MAX_COLUMNS, twoColumnHeaders), COVERAGE_MIN_COLUMNS);

  const threeColumnHeaders = ["P/R", "DHO + C&S", "Misc"];
  assert.equal(coverageColumnHasContent(slots, 2, threeColumnHeaders), true);
  assert.equal(getCoverageExportColumnCount(slots, COVERAGE_MAX_COLUMNS, threeColumnHeaders), COVERAGE_MAX_COLUMNS);
});

test("coverage payload hydration preserves saved text and icon fields", () => {
  const hydrated = hydrateCoveragePayload({
    league: "gleague",
    logoTeamId: "1612709928",
    columnCount: 2,
    columnHeaders: ["P/R", "DHO + C&S", ""],
    slots: [
      { column: 0, row: 0, subtitle: "5", iconKey: "vol-1" },
      { id: "coverage-2-2", subtitle: "1-4", iconKey: "red" },
    ],
  });

  assert.equal(hydrated.league, "gleague");
  assert.equal(hydrated.logoTeamId, "1612709928");
  assert.equal(hydrated.columnCount, COVERAGE_MIN_COLUMNS);
  assert.deepEqual(serializeCoverageColumnHeaders(hydrated.columnHeaders), ["P/R", "DHO + C&S", ""]);
  assert.deepEqual(serializeCoverageSlots(hydrated.slots).filter((slot) => slot.subtitle || slot.iconKey), [
    { id: "coverage-1-1", column: 0, row: 0, subtitle: "5", iconKey: "vol-1" },
    { id: "coverage-2-2", column: 1, row: 1, subtitle: "1-4", iconKey: "red" },
  ]);
});

test("coverage payload hydration migrates old slot titles to column headers", () => {
  const hydrated = hydrateCoveragePayload({
    slots: [
      { column: 0, row: 0, title: "P/R", subtitle: "5", iconKey: "vol-1" },
      { column: 1, row: 0, title: "DHO + C&S", iconKey: "war" },
      { column: 2, row: 0, title: "MISC" },
      { column: 0, row: 1, title: "1-4", iconKey: "red" },
    ],
  });

  assert.deepEqual(hydrated.columnHeaders, ["P/R", "DHO + C&S", "MISC"]);
  assert.equal(hydrated.slots[1].subtitle, "1-4");
  assert.equal(hydrated.slots[1].iconKey, "red");
});
