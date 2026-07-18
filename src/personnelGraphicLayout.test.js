import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONNEL_LAYOUT,
  getPersonnelLayoutGoldenSnapshot,
} from "./personnelGraphicLayout.js";

test("personnel export layout matches the approved golden geometry", () => {
  assert.deepEqual(getPersonnelLayoutGoldenSnapshot(), {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    headshot: { x: 560, y: 68, width: 800, height: 412 },
    name: { x: 455, y: 500, width: 1010 },
    statsBox: { x: 515, y: 620, width: 890, height: 190 },
    stats: {
      labelInsetY: 33,
      labelSize: 52,
      labelMinSize: 34,
      underlineGap: 5,
      valueInsetY: 113,
      valueSize: 72,
      valueMinSize: 48,
    },
    threePointBar: { labelX: 497, x: 577, y: 830, width: 767, height: 42 },
    tags: { y: 906, height: 78 },
  });
});

test("personnel layout keeps every lower graphic component inside the canvas", () => {
  const { canvas, statsBox, threePointBar, tags } = PERSONNEL_LAYOUT;
  assert.ok(statsBox.y + statsBox.height < threePointBar.y);
  assert.ok(threePointBar.y + threePointBar.height < tags.y);
  assert.ok(tags.y + tags.height <= canvas.height);
  assert.equal(statsBox.x + statsBox.width / 2, canvas.width / 2);
  assert.equal(threePointBar.x + threePointBar.width / 2, 960.5);
});
