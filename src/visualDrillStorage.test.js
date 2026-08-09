import test from "node:test";
import assert from "node:assert/strict";
import {
  findVisualDrillImageContentBounds,
  prepareVisualDrillImageUpload,
  sanitizeVisualDrillImageName,
  VISUAL_DRILL_IMAGE_MAX_DIMENSION,
  VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES,
  visualDrillImageDisplayName,
} from "./visualDrillStorage.js";

test("visual drill image names are storage safe", () => {
  assert.equal(sanitizeVisualDrillImageName("  My Team Logo (Final).PNG"), "My-Team-Logo-Final");
  assert.equal(sanitizeVisualDrillImageName("***"), "image");
});

test("visual drill storage paths produce readable labels", () => {
  assert.equal(
    visualDrillImageDisplayName("owner/123e4567-e89b-12d3-a456-426614174000--My-Team-Logo.png"),
    "My Team Logo"
  );
});

test("visual drill image bounds ignore transparent padding", () => {
  const pixels = new Uint8ClampedArray(5 * 4 * 4);
  const setAlpha = (x, y, alpha) => {
    pixels[(y * 5 + x) * 4 + 3] = alpha;
  };
  setAlpha(2, 1, 255);
  setAlpha(3, 1, 255);
  setAlpha(2, 2, 255);
  setAlpha(3, 2, 255);

  assert.deepEqual(findVisualDrillImageContentBounds(pixels, 5, 4), {
    x: 2,
    y: 1,
    width: 2,
    height: 2,
  });
  assert.equal(findVisualDrillImageContentBounds(new Uint8ClampedArray(16), 2, 2), null);
});

test("visual drill image bounds crop uniform opaque backgrounds", () => {
  const pixels = new Uint8ClampedArray(5 * 4 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
    pixels[index + 3] = 255;
  }
  const setWhite = (x, y) => {
    const index = (y * 5 + x) * 4;
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
  };
  setWhite(2, 1);
  setWhite(3, 1);
  setWhite(2, 2);
  setWhite(3, 2);

  assert.deepEqual(findVisualDrillImageContentBounds(pixels, 5, 4), {
    x: 2,
    y: 1,
    width: 2,
    height: 2,
  });
});

test("visual drill uploads keep compact storage limits", async () => {
  assert.equal(VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES, 512 * 1024);
  assert.equal(VISUAL_DRILL_IMAGE_MAX_DIMENSION, 900);

  const smallUpload = await prepareVisualDrillImageUpload({
    name: "Logo.png",
    size: 32 * 1024,
    type: "image/png",
  });
  assert.equal(smallUpload.contentType, "image/png");
  assert.equal(smallUpload.extension, "png");

  await assert.rejects(
    prepareVisualDrillImageUpload({
      name: "Huge.png",
      size: VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES + 1,
      type: "image/png",
    }),
    /capped/
  );
});
