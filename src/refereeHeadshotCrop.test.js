import test from "node:test";
import assert from "node:assert/strict";
import { buildCanvasAvatarPlacement } from "./refereeHeadshots.js";

const crop = { scale: 1.51, scaleY: 0.96, offsetY: 80 };
const placement = (size, override = crop, variant) => buildCanvasAvatarPlacement({
  sourceWidth: 592, sourceHeight: 850,
  targetX: 0, targetY: 0, targetSize: size, override, variant,
});

test("Biniam's saved crop has identical normalized geometry at preview and every export size", () => {
  const preview = placement(252);
  for (const size of [84, 120, 170, 480, 850]) {
    for (const [key, value] of Object.entries(placement(size))) {
      assert.ok(Math.abs(value / size - preview[key] / 252) < 1e-12, key);
    }
  }
  // The saved offset genuinely leaves a band; the enlarged preview must show it.
  assert.ok(preview.drawY > 8 && preview.drawY < 9);
});

test("legacy export-specific crops never override the saved editor crop", () => {
  const legacy = { ...crop, exportScale: 2, exportOffsetYPortrait: -30, exportOffsetYLandscape: 10 };
  for (const variant of ["portrait", "landscape", "was"]) {
    assert.deepEqual(placement(170, legacy, variant), placement(170));
  }
});

test("crop positioning preserves horizontal offsets, stretching, and target origin", () => {
  const actual = buildCanvasAvatarPlacement({
    sourceWidth: 600, sourceHeight: 300, targetX: 10, targetY: 20,
    targetSize: 308, override: { scale: 1, scaleX: 0.5, scaleY: 2, offsetX: 7, offsetY: -9 },
  });
  assert.deepEqual(actual, { drawWidth: 154, drawHeight: 308, drawX: 94, drawY: 11 });
});
