import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeVisualDrillImageName, visualDrillImageDisplayName } from "./visualDrillStorage.js";

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
