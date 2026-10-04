import assert from "node:assert/strict";
import test from "node:test";
import { isRosterFallbackUsable, ROSTER_FALLBACK_MAX_AGE_MS } from "./rosterFallback.js";

test("roster fallback accepts a bounded recent cache", () => {
  const now = Date.UTC(2026, 9, 3, 20);
  assert.equal(isRosterFallbackUsable({ teams: {}, cachedAt: now - 60_000 }, now), true);
  assert.equal(isRosterFallbackUsable({ teams: {}, fetchedAt: new Date(now - 60_000).toISOString() }, now), true);
});

test("roster fallback rejects missing timestamps and caches older than one day", () => {
  const now = Date.UTC(2026, 9, 3, 20);
  assert.equal(isRosterFallbackUsable({ teams: {} }, now), false);
  assert.equal(isRosterFallbackUsable({ teams: {}, cachedAt: now - ROSTER_FALLBACK_MAX_AGE_MS - 1 }, now), false);
});
