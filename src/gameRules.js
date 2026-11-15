export const TEAM_FOUL_DISPLAY_LIMIT = 5;
export const TEAM_FOUL_WARNING_DISPLAY = 4;

export function deriveGameChallenges(game = {}) {
  const teams = { home: game.homeTeam, away: game.awayTeam };
  const markers = { home: new Map(), away: new Map() };
  for (const action of game.playByPlayActions || []) {
    const subType = String(action?.subType || "").toLowerCase();
    const description = String(action?.description || "").toLowerCase();
    if (subType !== "challenge" && !subType.includes("coach challenge") && !description.includes("coach challenge")) continue;

    const side = ["home", "away"].find((candidate) =>
      (action.teamId != null && String(action.teamId) === String(teams[candidate]?.teamId))
      || (action.teamTricode && String(action.teamTricode).toUpperCase() === String(teams[candidate]?.teamTricode || "").toUpperCase()));
    if (!side) continue;

    const text = [action.descriptor, action.subType, action.description].join(" ").toLowerCase();
    const state = /overturn|successful|reversed/.test(text) && !/unsuccessful/.test(text)
      ? "won"
      : /support|stands|upheld|unsuccessful|confirmed/.test(text)
        ? "lost"
        : "pending";
    const key = `${action.period}|${action.clock}|${side}`;
    const previous = markers[side].get(key);
    if (!previous || (previous === "pending" && state !== "pending")) markers[side].set(key, state);
  }

  return Object.fromEntries(["home", "away"].map((side) => {
    const states = [...markers[side].values()];
    const direct = game.challenges?.[side];
    if (Number(game.gameStatus) === 3 && direct && states.length && states.every((state) => state === "pending")
      && Number(direct.challengesTotal) >= states.length) return [side, direct];
    return [side, states.length ? {
      challengesTotal: states.length,
      challengesWon: states.filter((state) => state === "won").length,
      challengeStates: states,
    } : direct || { challengesTotal: 0, challengesWon: 0 }];
  }));
}

export function buildChallengeCircles(challenges, independent = false) {
  const states = challenges?.challengeStates;
  if (Array.isArray(states) && states.length) {
    if (independent) return Array.from({ length: 2 }, (_, index) => ({ state: states[index] || "available" }));
    if (states.length > 1) return states.map((state) => ({ state }));
    return [{ state: states[0] }, ...(states[0] === "won" ? [{ state: "available" }] : [])];
  }
  const total = challenges?.challengesTotal ?? 0;
  const won = challenges?.challengesWon ?? 0;
  if (independent) {
    return Array.from({ length: 2 }, (_, index) => ({
      state: index >= total ? "available" : index < won ? "won" : "lost",
    }));
  }
  if (total === 0) return [{ state: "available" }];
  const circles = [{ state: won >= 1 ? "won" : "lost" }];
  if (won >= 1) circles.push({ state: total >= 2 ? (won >= 2 ? "won" : "lost") : "available" });
  return circles;
}

// G League challenges and Reset timeouts never consume a regular timeout.
export function getGLeagueTimeoutDisplay({ actions = [], teamId, period, isPregame = false }) {
  const currentPeriod = Number(period) || 1;
  const teamTimeouts = isPregame || !teamId ? [] : (Array.isArray(actions) ? actions : []).filter(action => (
    String(action?.actionType || "").toLowerCase() === "timeout"
    && String(action.teamId || "") === String(teamId)
    && Number(action.period) > 0 && Number(action.period) <= currentPeriod
  ));
  const isReset = action => String(action.subType || "").toLowerCase() === "reset";
  const used = teamTimeouts.filter(action => {
    if (isReset(action)) return false;
    const type = String(action.subType || "").toLowerCase();
    if (/official|media/.test(type)) return false;
    const text = [type, action.description, action.descriptor, ...(action.qualifiers || [])].join(" ");
    return !/challenge/i.test(text);
  }).length;
  return { total: 5, remaining: Math.max(0, 5 - used), resetUsed: teamTimeouts.some(isReset) };
}

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
