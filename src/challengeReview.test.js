import test from "node:test";
import assert from "node:assert/strict";
import { challengeNeedsReview, challengeReviewLabel,challengeReviewState,challengeReviewDescription } from "./challengeReview.js";
test("source omissions remain distinguishable from disputed matches", () => {
  const omission={ review_status: "needs_review", match_reason: "gamebook-whistle-not-published" };
  assert.equal(challengeReviewLabel(omission), "Whistle unavailable");
  assert.equal(challengeNeedsReview(omission),false);
  assert.equal(challengeReviewState(omission),"whistle_unavailable");
  assert.equal(challengeReviewLabel({ review_status: "needs_review" }), "Needs review");
  assert.equal(challengeNeedsReview({ review_status: "auto" }), false);
  assert.equal(challengeReviewLabel({}), "Not flagged");
});
test("corrected labels, true source conflicts and pending gamebooks are separate review reasons",()=>{
  const conflict={review_status:"needs_review",match_reason:"gamebook-vs-official-initial-call-conflict"};
  assert.equal(challengeReviewLabel(conflict),"Source conflict");
  const replacement={...conflict,gamebook_conflict_kind:"replacement-event-label"};
  assert.equal(challengeReviewLabel(replacement),"Original whistle unverified");
  assert.equal(challengeNeedsReview(replacement),true);
  assert.match(challengeReviewDescription(replacement),/same PDF alone cannot resolve/);
  assert.equal(challengeReviewState({...conflict,source_payload:{gamebookSourceConflict:{kind:"replacement-event-label"}}}),"original_whistle_unverified");
  assert.equal(challengeReviewLabel({review_status:"needs_review",match_reason:"matched-official-log-video-game-id"}),"Gamebook match pending");
});
