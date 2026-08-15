import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAPHIC_TOOL_TABS,
  TOOL_TABS,
  isGraphicToolTab,
  normalizeGraphicToolTab,
} from "./toolNavigation.js";

test("all configured graphic tabs are accepted by shared navigation helpers", () => {
  const expected = [
    TOOL_TABS.MATCHUP,
    TOOL_TABS.COVERAGE,
    TOOL_TABS.COURT_TIME,
    TOOL_TABS.PERSONNEL,
    TOOL_TABS.DEPTH_CHART,
  ];

  assert.deepEqual(GRAPHIC_TOOL_TABS.map((tab) => tab.key), expected);
  expected.forEach((tab) => {
    assert.equal(isGraphicToolTab(tab), true);
    assert.equal(normalizeGraphicToolTab(tab), tab);
  });
});

test("unknown graphic tabs fall back to Match-Up", () => {
  assert.equal(isGraphicToolTab("unknown"), false);
  assert.equal(normalizeGraphicToolTab("unknown"), TOOL_TABS.MATCHUP);
});
