import test from "node:test";
import assert from "node:assert/strict";
import {
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
