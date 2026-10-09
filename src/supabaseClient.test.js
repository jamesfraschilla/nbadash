import test from "node:test";
import assert from "node:assert/strict";
import { selectStoredAuthValue } from "./supabaseClient.js";

test("shared auth storage wins over a newer tab-only fallback session", () => {
  const shared = JSON.stringify({ access_token: "shared", refresh_token: "shared-refresh", expires_at: 100 });
  const tabOnly = JSON.stringify({ access_token: "stale-tab", refresh_token: "stale-refresh", expires_at: 200 });
  assert.equal(selectStoredAuthValue(shared, tabOnly), shared);
  assert.equal(selectStoredAuthValue(null, tabOnly), tabOnly);
});
