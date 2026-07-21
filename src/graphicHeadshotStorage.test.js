import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAPHIC_HEADSHOT_SOURCE_MAX_DIMENSION,
  GRAPHIC_HEADSHOT_SOURCE_LIMIT_BYTES,
  validateGraphicHeadshotDimensions,
  validateGraphicHeadshotFile,
} from "./graphicHeadshotStorage.js";

test("graphic headshot validation accepts a bounded PNG", () => {
  assert.equal(validateGraphicHeadshotFile({ type: "image/png", size: 1024 }), true);
});

test("graphic headshot validation rejects wrong, empty, and oversized files", () => {
  assert.throws(() => validateGraphicHeadshotFile({ type: "image/jpeg", size: 1024 }), /PNG/);
  assert.throws(() => validateGraphicHeadshotFile({ type: "image/png", size: 0 }), /empty/);
  assert.throws(
    () => validateGraphicHeadshotFile({ type: "image/png", size: GRAPHIC_HEADSHOT_SOURCE_LIMIT_BYTES + 1 }),
    /10 MB/
  );
});

test("graphic headshot validation rejects invalid and excessive dimensions", () => {
  assert.equal(validateGraphicHeadshotDimensions(1040, 760), true);
  assert.throws(() => validateGraphicHeadshotDimensions(0, 760), /invalid dimensions/);
  assert.throws(
    () => validateGraphicHeadshotDimensions(GRAPHIC_HEADSHOT_SOURCE_MAX_DIMENSION + 1, 1),
    /too large/
  );
  assert.throws(() => validateGraphicHeadshotDimensions(8000, 8000), /too large/);
});
