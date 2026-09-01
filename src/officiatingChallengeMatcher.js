import { challengeFoulSubtype } from "./officiatingCategoryNormalization.js";

function cleanText(value) {
  return String(value || "").trim();
}

function clockSeconds(value) {
  const text = cleanText(value);
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(text);
  if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const mmss = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  return NaN;
}

function normalizedCategory(value) {
  const text = cleanText(value).toLowerCase().replace(/[_-]+/g, " ");
  if (text.includes("foul")) return "foul";
  if (text.includes("goaltending") || text.includes("basket interference")) return "violation";
  if (text.includes("violation")) return "violation";
  if (text.includes("turnover") || text.includes("oob") || text.includes("out of bounds") || text.includes("team ball")) return "turnover";
  return "";
}

function challengeCategory(challenge) {
  return normalizedCategory(`${challenge.challenge_type || ""} ${challenge.initial_call || ""}`);
}

function findCrewChief(assignments, gameId) {
  return assignments.find((assignment) => (
    cleanText(assignment.game_id || assignment.gameId) === gameId &&
    cleanText(assignment.role_key || assignment.roleKey).toLowerCase() === "crewchief"
  )) || assignments.find((assignment) => (
    cleanText(assignment.game_id || assignment.gameId) === gameId &&
    Number(assignment.assignment_order || assignment.assignmentOrder) === 1
  )) || null;
}

function isCompatibleCall(challenge, call) {
  const category = challengeCategory(challenge);
  if (!category) return true;

  const callCategory = normalizedCategory([
    call.primary_category,
    call.secondary_category,
    call.action_type,
    call.sub_type,
    call.descriptor,
    call.description,
  ].filter(Boolean).join(" "));
  if (category === "turnover") {
    return callCategory === "turnover" || callCategory === "violation";
  }
  return callCategory === category;
}

function candidateScore(challenge, call, toleranceSeconds) {
  if (cleanText(call.game_id || call.gameId) !== cleanText(challenge.game_id || challenge.gameId)) return null;
  if (Number(call.period) !== Number(challenge.period)) return null;

  const challengeClock = clockSeconds(challenge.game_clock || challenge.gameClock);
  const callClock = clockSeconds(call.game_clock || call.gameClock);
  if (!Number.isFinite(challengeClock) || !Number.isFinite(callClock)) return null;

  const clockDelta = Math.abs(challengeClock - callClock);
  if (clockDelta > toleranceSeconds) return null;
  if (!isCompatibleCall(challenge, call)) return null;

  let score = 1 - (clockDelta / Math.max(toleranceSeconds, 1)) * 0.2;
  const category = challengeCategory(challenge);
  const callText = [
    call.primary_category,
    call.secondary_category,
    call.action_type,
    call.sub_type,
    call.descriptor,
    call.description,
  ].filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " ");
  if (category === "turnover" && callText.includes("out of bounds")) {
    score += 0.08;
  }
  if (cleanText(call.charged_team || call.chargedTeam) === cleanText(challenge.challenging_team || challenge.challengingTeam)) {
    score += 0.05;
  }
  if (cleanText(call.official_id || call.officialId) || cleanText(call.official_name || call.officialName)) {
    score += 0.05;
  }
  return Math.min(score, 0.99);
}

function findMatchingCall(challenge, calls, toleranceSeconds, reasonSuffix = "at-clock") {
  const candidates = calls
    .map((call) => ({ call, score: candidateScore(challenge, call, toleranceSeconds) }))
    .filter((candidate) => candidate.score !== null)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) return { call: null, confidence: 0, reason: `no-compatible-call-${reasonSuffix}` };
  if (candidates.length > 1 && Math.abs(candidates[0].score - candidates[1].score) < 0.01) {
    return { call: candidates[0].call, confidence: 0.62, reason: `ambiguous-compatible-call-${reasonSuffix}` };
  }
  return { call: candidates[0].call, confidence: candidates[0].score, reason: `matched-compatible-call-${reasonSuffix}` };
}

function findSecondPassMatchingCall(challenge, calls, toleranceSeconds) {
  const category = challengeCategory(challenge);
  if (!category) {
    return { call: null, confidence: 0, reason: "second-pass-skipped-low-whistle-signal-category" };
  }
  const adjustedTolerance = category === "turnover" ? Math.min(toleranceSeconds, 4) : toleranceSeconds;
  return findMatchingCall(challenge, calls, adjustedTolerance, "second-pass-window");
}

function mergeMatchReason(existingReason, nextReason) {
  return [...new Set([
    ...cleanText(existingReason || "challenge-source").split(";"),
    cleanText(nextReason),
  ].map(cleanText).filter(Boolean))].join(";");
}

export function enrichChallengeEventsWithOfficials(challenges, calls, assignments, options = {}) {
  const toleranceSeconds = Number(options.clockToleranceSeconds) || 2;
  const secondPassToleranceSeconds = Number(options.secondPassClockToleranceSeconds) || 12;
  const secondPassMinConfidence = Number(options.secondPassMinConfidence) || 0.76;
  return challenges.map((challenge) => {
    const gameId = cleanText(challenge.game_id || challenge.gameId);
    const crewChief = findCrewChief(assignments, gameId);
    const firstPass = findMatchingCall(challenge, calls, toleranceSeconds);
    const secondPass = firstPass.call
      ? firstPass
      : findSecondPassMatchingCall(challenge, calls, secondPassToleranceSeconds);
    const match = secondPass.call && secondPass.confidence >= secondPassMinConfidence
      ? secondPass
      : firstPass;
    const call = match.call;
    const existingWhistle = cleanText(challenge.whistling_official_id || challenge.whistling_official_name);
    const existingStatus = cleanText(challenge.review_status || challenge.reviewStatus);
    const confidence = call
      ? Math.max(Number(challenge.match_confidence || challenge.matchConfidence || 0), match.confidence)
      : Number(challenge.match_confidence || challenge.matchConfidence || 0.55);

    return {
      ...challenge,
      crew_chief_id: cleanText(challenge.crew_chief_id || crewChief?.official_id || crewChief?.officialId),
      crew_chief_name: cleanText(challenge.crew_chief_name || crewChief?.official_name || crewChief?.officialName),
      whistling_official_id: cleanText(challenge.whistling_official_id || call?.official_id || call?.officialId),
      whistling_official_name: cleanText(challenge.whistling_official_name || call?.official_name || call?.officialName),
      matched_action_number: challenge.matched_action_number ?? challenge.matchedActionNumber ?? call?.action_number ?? call?.actionNumber ?? null,
      matched_call_event_id: challenge.matched_call_event_id || challenge.matchedCallEventId || call?.id || null,
      challenge_sub_type: cleanText(challenge.challenge_sub_type || challenge.challengeSubType || challengeFoulSubtype(challenge, call)),
      match_confidence: confidence,
      match_reason: call
        ? mergeMatchReason(challenge.match_reason || challenge.matchReason, match.reason)
        : cleanText(challenge.match_reason || challenge.matchReason || match.reason),
      review_status: call
        ? existingStatus && existingStatus !== "needs_review" ? existingStatus : "auto"
        : existingWhistle
          ? existingStatus || "auto"
          : "needs_review",
      source_payload: {
        ...(challenge.source_payload || challenge.sourcePayload || {}),
        officialMatcher: {
          version: "challenge-official-v1",
          reason: match.reason,
          toleranceSeconds,
          matchedCall: call ? {
            gameId: call.game_id || call.gameId,
            actionNumber: call.action_number || call.actionNumber,
            period: call.period,
            gameClock: call.game_clock || call.gameClock,
            description: call.description,
            officialId: call.official_id || call.officialId,
            officialName: call.official_name || call.officialName,
          } : null,
          crewChief: crewChief ? {
            officialId: crewChief.official_id || crewChief.officialId,
            officialName: crewChief.official_name || crewChief.officialName,
          } : null,
        },
      },
    };
  });
}
