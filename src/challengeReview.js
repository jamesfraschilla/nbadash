export function challengeNeedsReview(row) {
  return row?.review_status === "needs_review";
}

export function challengeReviewLabel(row) {
  if (!challengeNeedsReview(row)) return "Not flagged";
  return row.match_reason === "gamebook-whistle-not-published" ? "Whistle not published" : "Needs review";
}
