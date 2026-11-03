import test from "node:test";
import assert from "node:assert/strict";
import { challengeNeedsReview, challengeReviewLabel } from "./challengeReview.js";
test("source omissions remain distinguishable from disputed matches", () => {
  assert.equal(challengeReviewLabel({ review_status: "needs_review", match_reason: "gamebook-whistle-not-published" }), "Whistle not published");
  assert.equal(challengeReviewLabel({ review_status: "needs_review" }), "Needs review");
  assert.equal(challengeNeedsReview({ review_status: "auto" }), false);
  assert.equal(challengeReviewLabel({}), "Not flagged");
});
