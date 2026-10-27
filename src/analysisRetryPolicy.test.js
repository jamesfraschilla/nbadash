import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisRetryPolicy } from "./analysisRetryPolicy.js";
import { assertNonEmptyLiveFeed } from "../supabase/functions/_shared/liveFeedIntegrity.ts";

test("corrections get their own settled retry budget instead of exhausting a lifetime three-attempt cap", () => {
  const policy = new AnalysisRetryPolicy();
  for (let n = 0; n < 3; n++) assert.equal(policy.begin("q1", "original", n), true);
  assert.equal(policy.begin("q1", "original", 4), false);
  policy.observe("q1", "corrected", 10);
  assert.equal(policy.begin("q1", "corrected", 59_999), false);
  assert.equal(policy.begin("q1", "corrected", 60_010), true);
});

test("continuous corrections stay bounded and reserve attempts for the final feed", () => {
  const policy = new AnalysisRetryPolicy();
  for (let n = 0; n < 6; n++) {
    policy.observe("q1", String(n), n * 120_000);
    assert.equal(policy.begin("q1", String(n), n * 120_000 + 60_000), true);
  }
  policy.observe("q1", "final", 1_000_000);
  assert.equal(policy.begin("q1", "final", 1_060_000), false);
  assert.equal(policy.begin("q1", "final", 1_060_000, true), true);
  assert.equal(policy.begin("q1", "final", 1_060_001, true), true);
  assert.equal(policy.begin("q1", "final", 1_060_002, true), false);
});

test("source deferrals do not burn model retry budgets", () => {
  const policy = new AnalysisRetryPolicy();
  for (let n = 0; n < 12; n++) {
    assert.equal(policy.begin("q1", "a", n), true);
    policy.defer("q1", "a");
  }
  assert.equal(policy.states.get("q1").total, 0);
});

test("empty or missing live play-by-play is retryable, while pregame emptiness is normal", () => {
  for (const gameStatus of [2, 3]) {
    for (const playByPlayActions of [undefined, [], {}]) {
      assert.throws(() => assertNonEmptyLiveFeed({ gameStatus, playByPlayActions }), { code: "EMPTY_LIVE_FEED", retryable: true });
    }
    assert.doesNotThrow(() => assertNonEmptyLiveFeed({ gameStatus, playByPlayActions: [{ actionNumber: 1 }] }));
  }
  assert.doesNotThrow(() => assertNonEmptyLiveFeed({ gameStatus: 1 }));
});
