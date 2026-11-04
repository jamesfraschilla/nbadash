import { matchOfficialToken } from "./officiatingParser.js";
import {gamebookTeamMatches} from "./officiatingTeamNames.js";

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

export function matchGamebookChallenge(challenge, bookRows, peers=[challenge]) {
  const delta=row=>Math.abs(challengeClockSeconds(row.gameClock)-challengeClockSeconds(challenge.game_clock));
  const sameTeam=row=>!challenge.challenging_team || gamebookTeamMatches(challenge,row);
  const exact=bookRows.filter(row=>row.period===Number(challenge.period) && delta(row)<0.11 && sameTeam(row));
  if(exact.length===1)return {row:exact[0],reason:"exact-team-period-clock",clockDeltaSeconds:delta(exact[0])};
  if(exact.length>1)return null;
  const pdf=challenge.source_payload?.pdfRow;
  // Clock adjustments need an explicit official ledger identity, not a generic
  // nearest-clock match. Keep the PDF clock and stable record identity intact.
  if(!pdf || String(pdf.game_id)!==String(challenge.game_id) || pdf.team_challenged!==challenge.challenging_team
    || Number(pdf.period)!==Number(challenge.period)
    || Math.abs(challengeClockSeconds(pdf.game_clock)-challengeClockSeconds(challenge.game_clock))>=0.11)return null;
  const compatible=(log,row)=>gamebookTeamMatches(log,row)
    && (!row.outcome || row.outcome===String(log.challenge_outcome||"").toLowerCase())
    && (!row.challengeType || !log.challenge_type || row.challengeType===log.challenge_type);
  const near=bookRows.filter(row=>row.period===Number(challenge.period) && delta(row)<=2 && compatible(challenge,row));
  if(near.length!==1)return null;
  // The corrected-clock PBP sibling is not a second official challenge. Count
  // only ledger-backed competitors; still reject two distinct PDF entries.
  const competing=new Set(peers.filter(log=>!!log.source_payload?.pdfRow
    && String(log.game_id)===String(challenge.game_id)
    && Number(log.period)===near[0].period && compatible(log,near[0])
    && Math.abs(challengeClockSeconds(log.game_clock)-challengeClockSeconds(near[0].gameClock))<=2)
    .map(log=>[log.challenging_team,log.period,challengeClockSeconds(log.game_clock)].join("|")));
  if(competing.size!==1)return null;
  return {row:near[0],reason:"pdf-verified-exclusive-team-type-outcome-clock-adjustment",clockDeltaSeconds:delta(near[0])};
}

export function reconcileGamebookChallenge(challenge, bookRows, assignments, url, options={}) {
  if (["manual", "verified"].includes(challenge.review_status)) return challenge;
  const match=matchGamebookChallenge(challenge,bookRows,options.peerChallenges);
  if(!match)return challenge;
  const row=match.row;
  const officials = assignments.map(a => ({ personId: a.official_id, fullName: a.official_name,
    firstName: String(a.official_name || "").split(/\s+/)[0],
    familyName: String(a.official_name || "").split(/\s+/).slice(1).join(" ") }));
  const official = matchOfficialToken(row.officialToken, officials);
  const evidence = { version: "gamebook-challenge-v1", url, ...row,
    ...(options.gamebookSha256?{sha256:options.gamebookSha256}:{}) };
  const corrected = { ...challenge, source_payload: { ...challenge.source_payload, gamebookChallenge: evidence } };
  corrected.source_payload.gamebookMatch={version:"gamebook-match-v2",reason:match.reason,
    clockDeltaSeconds:match.clockDeltaSeconds,ledgerClock:challenge.game_clock,bookClock:row.gameClock};
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
  const sourceOutcome=String(original.challenge_outcome || challenge.challenge_outcome || "").toLowerCase();
  const outcomeConflict=Boolean(sourceOutcome && row.outcome && sourceOutcome!==row.outcome);
  const conflict = Boolean(directionConflict || typeConflict || outcomeConflict);
  // A final corrected event label is not evidence of the original foul's
  // subtype or of who blew the original whistle. Preserve both source claims
  // and keep attribution review open even when the label reversal is explained.
  const replacementLabel = Boolean(directionConflict && !outcomeConflict
    && /^successful$/i.test(String(original.challenge_outcome || challenge.challenge_outcome || ""))
    && (/^Offensive Foul$/i.test(String(original.ruling_description || "")) && row.subType === "Offensive Foul"
      || /^Defensive Foul$/i.test(String(original.ruling_description || "")) && row.challengeType === "Foul" && row.subType !== "Offensive Foul"));
  if (conflict) corrected.source_payload.gamebookSourceConflict = {
    version: "original-vs-corrected-v1",
    kind: replacementLabel ? "replacement-event-label" : "unexplained-source-disagreement",
    pdfInitialCall: originalCall,
    pdfFinalCall: original.ruling_description || "",
    bookEventLabel: row.originalCall,
    originalWhistleVerified: false,
    ...(outcomeConflict?{pdfOutcome:sourceOutcome,bookOutcome:row.outcome}:{}),
  };
  else delete corrected.source_payload.gamebookSourceConflict;
  const fallbackSubtype = /offensive foul/i.test(originalCall) ? "Offensive Foul"
    : /defensive foul/i.test(originalCall) ? "Defensive Foul" : originalType === "OOB" ? "Out Of Bounds" : "";
  const type = originalType || row.challengeType || challenge.challenge_type;
  const subtype = conflict ? fallbackSubtype : row.subType || fallbackSubtype || challenge.challenge_sub_type;
  const missingWhistle = !resolvedOfficial && !String(challenge.whistling_official_id || challenge.whistling_official_name || "").trim();
  const needsReview = !type || !subtype || unresolvedNamedOfficial || missingWhistle || conflict;
  return { ...corrected, challenge_type: type, challenge_sub_type: subtype,
    initial_call: originalCall || (row.challengeType ? row.originalCall : challenge.initial_call),
    whistling_official_id: conflict ? null : resolvedOfficial ? String(official.official.personId) : unresolvedNamedOfficial ? null : challenge.whistling_official_id,
    whistling_official_name: conflict ? null : resolvedOfficial ? official.official.fullName : unresolvedNamedOfficial ? null : challenge.whistling_official_name,
    // Overturned calls may disappear from corrected PBP. Do not invent a
    // call-event ID or insert a counted foul into nba_official_call_events.
    matched_call_event_id: null,
    matched_action_number: challenge.source_payload?.actionNumber ?? null,
    challenge_outcome: challenge.challenge_outcome || row.outcome,
    match_confidence: needsReview ? 0.55 : 0.99,
    match_reason: conflict ? "gamebook-vs-official-initial-call-conflict"
      : missingWhistle && !row.officialToken && type && subtype ? "gamebook-whistle-not-published"
        : needsReview ? "gamebook-original-call-needs-review" : "verified-gamebook-original-challenged-call",
    review_status: needsReview ? "needs_review" : "auto" };
}
