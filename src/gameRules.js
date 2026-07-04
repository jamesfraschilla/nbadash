export const TEAM_FOUL_DISPLAY_LIMIT = 5;
export const TEAM_FOUL_WARNING_DISPLAY = 4;

export function parseTeamFoulMarker(description) {
  if (!description) return null;
  const text = String(description);
  const teamMatch = text.match(/\bT(\d+)\b/);
  const teamFouls = teamMatch ? Number.parseInt(teamMatch[1], 10) : null;
  const inPenalty = /\bPN\b/.test(text);
  if (teamFouls == null && !inPenalty) return null;
  return {
    teamFouls: Number.isNaN(teamFouls) ? null : teamFouls,
    inPenalty,
  };
}

export function parsePeriodClockSeconds(clock) {
  if (!clock) return null;
  const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(String(clock));
  if (!match) return null;
  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2] || 0);
  return (minutes * 60) + seconds;
}

export function isTeamFoulAction(action) {
  if (action?.actionType !== "foul") return false;
  const subType = String(action.subType || "").toLowerCase();
  const descriptor = String(action.descriptor || "").toLowerCase();
  const qualifiers = (action.qualifiers || []).map((q) => String(q || "").toLowerCase());
  if (subType === "offensive") return false;
  if (subType.includes("technical") || descriptor.includes("technical")) return false;
  if (qualifiers.some((q) => q.includes("technical"))) return false;
  return true;
}

export function buildTeamFoulInfo({
  actions = [],
  teamId,
  period,
  isSummerLeague = false,
}) {
  const safeTeamId = String(teamId || "").trim();
  const currentPeriod = Number(period) || 1;
  const isSummerLeagueOvertime = Boolean(isSummerLeague) && currentPeriod > 4;
  const penaltyThreshold = isSummerLeagueOvertime ? 2 : TEAM_FOUL_DISPLAY_LIMIT;
  const lastTwoSeconds = 2 * 60;
  let markerCount = 0;
  let fallbackCount = 0;
  let lastTwoCount = 0;
  let inPenalty = false;
  let sawMarker = false;

  (Array.isArray(actions) ? actions : []).forEach((action) => {
    if (Number(action?.period) !== currentPeriod) return;
    if (!isTeamFoulAction(action)) return;
    if (String(action.teamId || "").trim() !== safeTeamId) return;

    fallbackCount += 1;
    const remaining = parsePeriodClockSeconds(action.clock);
    if (!isSummerLeagueOvertime && remaining != null && remaining <= lastTwoSeconds) {
      lastTwoCount += 1;
    }

    const marker = parseTeamFoulMarker(action.description);
    if (!marker) return;
    sawMarker = true;
    if (marker.teamFouls != null) markerCount = Math.max(markerCount, marker.teamFouls);
    if (marker.inPenalty) inPenalty = true;
  });

  const rawCount = (sawMarker && markerCount > 0) ? markerCount : fallbackCount;
  if (!inPenalty && rawCount >= penaltyThreshold) inPenalty = true;
  if (!isSummerLeagueOvertime && !inPenalty && lastTwoCount >= 2) inPenalty = true;

  if (isSummerLeagueOvertime) {
    return {
      count: inPenalty
        ? TEAM_FOUL_DISPLAY_LIMIT
        : rawCount >= 1
          ? TEAM_FOUL_WARNING_DISPLAY
          : 0,
      inPenalty,
      rawCount,
    };
  }

  let displayCount = inPenalty ? TEAM_FOUL_DISPLAY_LIMIT : rawCount;
  if (!inPenalty && lastTwoCount >= 1 && displayCount < TEAM_FOUL_WARNING_DISPLAY) {
    displayCount = TEAM_FOUL_WARNING_DISPLAY;
  }
  if (displayCount > TEAM_FOUL_DISPLAY_LIMIT) displayCount = TEAM_FOUL_DISPLAY_LIMIT;

  return {
    count: displayCount,
    inPenalty,
    rawCount,
  };
}

function isTeamTimeoutAction(action, teamId) {
  return action?.actionType === "timeout"
    && String(action.teamId || "").trim() === String(teamId || "").trim()
    && String(action.subType || "").toLowerCase() !== "officials";
}

export function getSummerLeagueTimeoutDisplay({
  actions = [],
  teamId,
  period,
  isPregame = false,
}) {
  const currentPeriod = Number(period) || 1;
  const isOvertime = currentPeriod > 4;
  const allowed = isOvertime ? 1 : 2;
  const timeoutActions = Array.isArray(actions) ? actions : [];
  const used = isPregame ? 0 : timeoutActions.filter((action) => {
    if (!isTeamTimeoutAction(action, teamId)) return false;
    const actionPeriod = Number(action.period) || 0;
    if (isOvertime) return actionPeriod === currentPeriod;
    if (currentPeriod <= 2) return actionPeriod >= 1 && actionPeriod <= 2;
    return actionPeriod >= 3 && actionPeriod <= 4;
  }).length;

  return {
    remaining: Math.max(0, allowed - used),
    total: 2,
  };
}
