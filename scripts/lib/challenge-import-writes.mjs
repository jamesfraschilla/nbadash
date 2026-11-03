import { randomUUID } from "node:crypto";
import { challengeLinkIdentity } from "../../src/officiatingChallengeLinks.js";

export function challengeNaturalKey(row) {
  return [row.game_id, row.challenging_team, row.period ?? -1, row.game_clock, row.source]
    .map(value => String(value ?? "")).join("|");
}

export function prepareChallengeImportWrites(rows, existingRows, makeId = randomUUID) {
  const existingByKey = new Map(existingRows.map(row => [challengeNaturalKey(row), row]));
  let inserted = 0;
  const writes = rows.map(row => {
    const existing = existingByKey.get(challengeNaturalKey(row));
    const evidenceRows = existingRows.filter(candidate => challengeLinkIdentity(candidate) === challengeLinkIdentity(row)
      && (candidate.source_payload?.gamebookChallenge || ["manual", "verified"].includes(candidate.review_status)));
    const evidence = existing && (existing.source_payload?.gamebookChallenge || ["manual", "verified"].includes(existing.review_status))
      ? existing : evidenceRows.length === 1 ? evidenceRows[0] : null;
    if (!existing) inserted++;
    // Mixed-key bulk upserts serialize omitted IDs as NULL. Every row needs an
    // explicit UUID; retain existing UUIDs so annotations/references stay valid.
    const write = { ...row, id: existing?.id || makeId(), source_payload: {
      ...evidence?.source_payload, ...existing?.source_payload, ...row.source_payload,
    } };
    if (!write.id) throw new Error("Challenge import generated an empty ID");
    if (evidence) {
      for (const key of ["challenge_type", "challenge_sub_type", "initial_call", "challenge_outcome",
        "whistling_official_id", "whistling_official_name", "matched_call_event_id", "matched_action_number",
        "match_confidence", "match_reason", "review_status"]) {
        if (evidence[key] !== undefined) write[key] = evidence[key];
      }
      // A changed document must be checked against retained gamebook evidence.
      // Manual decisions remain protected by the reconciler's existing guard.
      if (evidence.source_payload?.gamebookChallenge
        && !["manual", "verified"].includes(evidence.review_status)
        && evidence.source_payload?.pdfSha256 !== row.source_payload?.pdfSha256) {
        write.review_status = "needs_review";
        write.match_reason = "updated-pdf-recheck-gamebook";
      }
    }
    return write;
  });
  if (new Set(writes.map(row => row.id)).size !== writes.length) throw new Error("Duplicate challenge IDs in import");
  return { writes, inserted, updated: writes.length - inserted };
}
