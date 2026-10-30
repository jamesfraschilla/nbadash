import { matchOfficialToken } from "./officiatingParser.js";

export function parseGamebookChallenges(pages = []) {
  const rows = [];
  for (const page of pages) {
    const text = String(page.text || "");
    if (!text.includes("OFFICIAL PLAY-BY-PLAY")) continue;
    const quarter = text.match(/\b([1-4])(?:st|nd|rd|th) QUARTER\b/i);
    const overtime = text.match(/\b(?:(\d+)(?:st|nd|rd|th) )?(?:OVERTIME|OT)\b/i);
    const period = quarter ? Number(quarter[1]) : overtime ? 4 + Number(overtime[1] || 1) : 0;
    if (!period) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/Coach['’]s Challenge/i.test(lines[i])) continue;
      let excerpt = lines[i].trim();
      // Wrapped rulings belong to this row, not the next clocked event.
      for (let j = i + 1; j < lines.length && j <= i + 3 && !/^\s*\d{0,2}:\d{2}/.test(lines[j]); j++) {
        if (/Copyright|End of|Coach['’]s Challenge/i.test(lines[j])) break;
        excerpt += ` ${lines[j].trim()}`;
      }
      // NBA books omit the minute zero (:56.3), and PDF text extraction can
      // interleave the left clock column into a wrapped player name mid-line.
      const clockToken = excerpt.match(/(?<!\d)(\d{0,2}:\d{2}(?:\.\d+)?)/)?.[1];
      const clock = clockToken?.startsWith(":") ? `00${clockToken}` : clockToken;
      if (clockToken && (!excerpt.startsWith(clockToken) || clockToken.startsWith(":"))) {
        excerpt = `${clock} ${excerpt.replace(clockToken, "").trim()}`;
      }
      const body = excerpt.split(/Coach['’]s Challenge\s*/i)[1] || "";
      const original = body.split(/:\s*(?:Call |Ruling )?(?:Overturned|Stands|Upheld|Confirmed)/i)[0].trim();
      // Some overturned calls use `(N.Sago): No Foul ...` rather than
      // `: Call Overturned`. The caller still belongs to the original call.
      const officialToken = original.match(/\(([A-Za-z][A-Za-z.' -]+)\)(?=\s*(?::|$))/)?.[1] || "";
      const challengeType = /FOUL|\bOffensive\b/i.test(original) ? "Foul"
        : /out of bounds|TURNOVER|team ball/i.test(original) ? "OOB"
          : /goaltend|basket interference/i.test(original) ? "Violation" : "";
      const subType = /S\.?FOUL|shooting foul/i.test(original) ? "Shooting Foul"
        : /OFF\.?Foul|\boffensive\b|charge/i.test(original) ? "Offensive Foul"
          : /L\.?B\.?Foul|loose ball/i.test(original) ? "Loose Ball Foul"
            : /P\.?FOUL|personal foul/i.test(original) ? "Foul on Floor"
              : /goaltend/i.test(original) ? "Goaltending"
                : challengeType === "OOB" ? "Out Of Bounds" : "";
      if (clock) rows.push({ period, gameClock: clock, challengeType, subType, officialToken,
        challengingTeamName: excerpt.replace(/^\d{1,2}:\d{2}(?:\.\d+)?\s*/, "").split(/Coach['’]s Challenge/i)[0].trim(),
        originalCall: original, outcome: /Call Overturned/i.test(body) ? "successful"
          : /Call (?:Stands|Upheld|Confirmed)/i.test(body) ? "unsuccessful" : "",
        page: page.page, excerpt });
    }
  }
  return rows;
}

export function challengeClockSeconds(clock) {
  const iso = String(clock || "").match(/^PT(?:(\d+)M)?([\d.]+)S$/);
  if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2]);
  const mmss = String(clock || "").match(/^(\d+):([\d.]+)$/);
  return mmss ? Number(mmss[1]) * 60 + Number(mmss[2]) : NaN;
}

export function reconcileGamebookChallenge(challenge, bookRows, assignments, url) {
  if (["manual", "verified"].includes(challenge.review_status) && !challenge.source_payload?.gamebookChallenge) return challenge;
  const matches = bookRows.filter(row => row.period === Number(challenge.period)
    && Math.abs(challengeClockSeconds(row.gameClock) - challengeClockSeconds(challenge.game_clock)) < 0.11);
  if (matches.length !== 1) return challenge;
  const row = matches[0];
  const officials = assignments.map(a => ({ personId: a.official_id, fullName: a.official_name,
    firstName: String(a.official_name || "").split(/\s+/)[0],
    familyName: String(a.official_name || "").split(/\s+/).slice(1).join(" ") }));
  const official = matchOfficialToken(row.officialToken, officials);
  const evidence = { version: "gamebook-challenge-v1", url, ...row };
  const corrected = { ...challenge, source_payload: { ...challenge.source_payload, gamebookChallenge: evidence } };
  // SHOT/TIMEOUT are occasionally used as original-call placeholders. Keep
  // independently supported fields; do not infer a foul subtype from the
  // corrected outcome or erase a valid whistle just because a book omits it.
  const resolvedOfficial = official.official && official.confidence >= 0.95;
  const unresolvedNamedOfficial = row.officialToken && !resolvedOfficial;
  // Some book challenge lines reuse a corrected event label. The weekly NBA
  // review document explicitly separates initial and final calls; never turn
  // its original defensive foul into the replacement offensive foul.
  const original = challenge.source_payload?.pdfRow || challenge.source_payload?.officialOriginalCall || {};
  const originalCall = String(original.initial_call || "");
  const originalTrigger = String(original.trigger || "").toLowerCase();
  const originalType = /foul/.test(originalTrigger) ? "Foul" : /bounds|oob/.test(originalTrigger) ? "OOB"
    : /goaltend|interference/.test(originalTrigger) ? "Violation" : "";
  const directionConflict = /defensive foul/i.test(originalCall) && row.subType === "Offensive Foul"
    || /offensive foul/i.test(originalCall) && row.challengeType === "Foul" && row.subType && row.subType !== "Offensive Foul";
  const typeConflict = originalType && row.challengeType && originalType !== row.challengeType;
  const conflict = Boolean(directionConflict || typeConflict);
  const fallbackSubtype = /offensive foul/i.test(originalCall) ? "Offensive Foul"
    : /defensive foul/i.test(originalCall) ? "Defensive Foul" : originalType === "OOB" ? "Out Of Bounds" : "";
  const type = originalType || row.challengeType || challenge.challenge_type;
  const subtype = conflict ? fallbackSubtype : row.subType || fallbackSubtype || challenge.challenge_sub_type;
  const needsReview = !type || !subtype || unresolvedNamedOfficial || conflict;
  return { ...corrected, challenge_type: type, challenge_sub_type: subtype,
    initial_call: originalCall || (row.challengeType ? row.originalCall : challenge.initial_call),
    whistling_official_id: resolvedOfficial ? String(official.official.personId) : unresolvedNamedOfficial ? null : challenge.whistling_official_id,
    whistling_official_name: resolvedOfficial ? official.official.fullName : unresolvedNamedOfficial ? null : challenge.whistling_official_name,
    // Overturned calls may disappear from corrected PBP. Do not invent a
    // call-event ID or insert a counted foul into nba_official_call_events.
    matched_call_event_id: null,
    matched_action_number: challenge.source_payload?.actionNumber ?? null,
    challenge_outcome: challenge.challenge_outcome || row.outcome,
    match_confidence: needsReview ? 0.55 : 0.99,
    match_reason: conflict ? "gamebook-vs-official-initial-call-conflict" : needsReview ? "gamebook-original-call-needs-review" : "verified-gamebook-original-challenged-call",
    review_status: needsReview ? "needs_review" : "auto" };
}
