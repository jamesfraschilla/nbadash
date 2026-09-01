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

function normalizedText(value) {
  return cleanText(value).toLowerCase().replace(/[_-]+/g, " ");
}

function isSuccessfulChallenge(row) {
  return ["successful", "overturned"].includes(normalizedText(row.challenge_outcome || row.challengeOutcome || row.ruling_outcome || row.rulingOutcome));
}

function isOobChallenge(row) {
  const text = normalizedText(`${row.challenge_type || row.challengeType || ""} ${row.initial_call || row.initialCall || ""}`);
  return text.includes("oob") || text.includes("out of bounds") || text.includes("team ball");
}

function isFoulCall(row) {
  const text = normalizedText(`${row.primary_category || row.primaryCategory || ""} ${row.action_type || row.actionType || ""} ${row.description || ""}`);
  return text.includes("foul");
}

export function successfulOobChallengeAssessedFoul(challenge, calls = [], options = {}) {
  if (!isSuccessfulChallenge(challenge) || !isOobChallenge(challenge)) return false;

  const toleranceSeconds = Number(options.toleranceSeconds) || 2;
  const challengeClock = clockSeconds(challenge.game_clock || challenge.gameClock);
  if (!Number.isFinite(challengeClock)) return false;

  return calls.some((call) => {
    if (!isFoulCall(call)) return false;
    if (cleanText(call.game_id || call.gameId) !== cleanText(challenge.game_id || challenge.gameId)) return false;
    if (Number(call.period) !== Number(challenge.period)) return false;
    const callClock = clockSeconds(call.game_clock || call.gameClock);
    return Number.isFinite(callClock) && Math.abs(callClock - challengeClock) <= toleranceSeconds;
  });
}

export function proximateAutoTagChallengeIds(challenges = [], calls = [], options = {}) {
  const callsByGamePeriod = new Map();
  calls.forEach((call) => {
    if (!isFoulCall(call)) return;
    const key = `${cleanText(call.game_id || call.gameId)}|${Number(call.period)}`;
    if (!callsByGamePeriod.has(key)) callsByGamePeriod.set(key, []);
    callsByGamePeriod.get(key).push(call);
  });

  return challenges
    .filter((challenge) => {
      const key = `${cleanText(challenge.game_id || challenge.gameId)}|${Number(challenge.period)}`;
      return successfulOobChallengeAssessedFoul(challenge, callsByGamePeriod.get(key) || [], options);
    })
    .map((challenge) => cleanText(challenge.id))
    .filter(Boolean);
}
