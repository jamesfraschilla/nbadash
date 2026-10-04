import assert from "node:assert/strict";
import test from "node:test";
import { resolveFeatureAccess } from "./featureAccess.js";

test("Graphics can remain enabled while Tools is disabled", () => {
  const flags = new Set(["graphics"]);
  assert.deepEqual(resolveFeatureAccess({ accountsEnabled: true, hasFeature: (flag) => flags.has(flag) }), {
    tools: false,
    graphics: true,
  });
});

test("legacy Tools access continues to include Graphics", () => {
  const flags = new Set(["tools"]);
  assert.deepEqual(resolveFeatureAccess({ accountsEnabled: true, hasFeature: (flag) => flags.has(flag) }), {
    tools: true,
    graphics: true,
  });
});
