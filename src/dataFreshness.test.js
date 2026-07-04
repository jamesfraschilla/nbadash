import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFreshnessSummary,
  formatPollingInterval,
  latestActionTimestamp,
} from "./dataFreshness.js";

test("latestActionTimestamp returns the newest valid action time", () => {
  assert.equal(
    latestActionTimestamp([
      { timeActual: "2026-07-05T19:00:10.000Z" },
      { timeActual: "" },
      { timeActual: "2026-07-05T19:00:25.000Z" },
    ]),
    Date.parse("2026-07-05T19:00:25.000Z")
  );
});

test("buildFreshnessSummary reports update and play ages", () => {
  const now = Date.parse("2026-07-05T19:01:00.000Z");
  assert.deepEqual(
    buildFreshnessSummary({
      dataUpdatedAt: Date.parse("2026-07-05T19:00:48.000Z"),
      actions: [{ timeActual: "2026-07-05T19:00:20.000Z" }],
      now,
      isFetching: true,
    }),
    {
      label: "Updated 12s · Play 40s · Syncing",
      updatedAgeMs: 12_000,
      playAgeMs: 40_000,
      level: "warning",
    }
  );
});

test("buildFreshnessSummary marks stale data after ninety seconds", () => {
  const now = Date.parse("2026-07-05T19:02:00.000Z");
  assert.equal(
    buildFreshnessSummary({
      dataUpdatedAt: Date.parse("2026-07-05T19:00:20.000Z"),
      now,
    }).level,
    "stale"
  );
});

test("formatPollingInterval formats seconds and minutes", () => {
  assert.equal(formatPollingInterval(2_000), "2s");
  assert.equal(formatPollingInterval(120_000), "2m");
});
