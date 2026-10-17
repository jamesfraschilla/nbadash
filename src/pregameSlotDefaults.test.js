import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultPregameSlotOffsets } from "./pregameSlotDefaults.js";

test("pregame slots end 45 minutes before tip and move backward in 15-minute intervals", () => {
  assert.deepEqual(buildDefaultPregameSlotOffsets(4), [90, 75, 60, 45]);
});
