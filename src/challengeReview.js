export function challengeReviewState(row) {
  if(row?.review_status!=="needs_review")return "resolved";
  const reason=String(row.match_reason||"");
  if(reason==="gamebook-whistle-not-published")return "whistle_unavailable";
  if(reason==="gamebook-vs-official-initial-call-conflict")return (
    row.gamebook_conflict_kind || row.source_payload?.gamebookSourceConflict?.kind
  )==="replacement-event-label" ? "original_whistle_unverified" : "source_conflict";
  if(reason==="matched-official-log-video-game-id")return "gamebook_pending";
  return "needs_review";
}

export function challengeNeedsReview(row) {
  return !["resolved","whistle_unavailable"].includes(challengeReviewState(row));
}

export function challengeReviewLabel(row) {
  return {resolved:"Not flagged",whistle_unavailable:"Whistle unavailable",
    original_whistle_unverified:"Original whistle unverified",source_conflict:"Source conflict",
    gamebook_pending:"Gamebook match pending",needs_review:"Needs review"}[challengeReviewState(row)];
}

export function challengeReviewDescription(row) {
  return {
    resolved:"No unresolved attribution flag.",
    whistle_unavailable:"The gamebook confirms the challenged call but publishes no whistling official. This is a known source omission, not a disputed challenge. The challenge and its outcome remain counted; no whistle is guessed. Source updates are retried daily.",
    original_whistle_unverified:"The official PDF confirms the initial and final calls, but the gamebook uses a corrected event label. Its named official is not verified as the original whistling official. Original-whistle evidence is still required; retrying the same PDF alone cannot resolve it.",
    source_conflict:"Published sources disagree about the original call. This requires source-backed adjudication; a successful import or retry does not resolve the conflict.",
    gamebook_pending:"The official PDF entry is imported, but matching gamebook evidence has not been attached. The gamebook fetch, parser or match requires investigation.",
    needs_review:"Attribution is incomplete or ambiguous. Updated sources are retried daily; this is not assigned to a human automatically.",
  }[challengeReviewState(row)];
}
