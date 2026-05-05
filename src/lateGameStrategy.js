import { normalizeClock } from "./utils.js";

const FINAL_MINUTE_SECONDS = 60;
const PLAY_MODE_SECONDS = 6 * 60;
const FEED_CONFIDENCE_HIGH_SECONDS = 3;
const FEED_CONFIDENCE_MEDIUM_SECONDS = 8;

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clockToSeconds(clock) {
  const normalized = normalizeClock(clock);
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) return 0;
  return (safeNumber(match[1], 0) * 60) + safeNumber(match[2], 0);
}

function scoreLabel(diff) {
  return `${diff > 0 ? "+" : ""}${diff}`;
}

function normalizeOverrideClock(value, fallback) {
  const raw = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (!match) return fallback;
  const minutes = Math.max(0, safeNumber(match[1], 0));
  const seconds = Math.min(59, Math.max(0, safeNumber(match[2], 0)));
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function overrideNumber(value, fallback, min = -Infinity, max = Infinity) {
  if (value === "" || value == null) return fallback;
  const numeric = safeNumber(value, fallback);
  return Math.min(max, Math.max(min, numeric));
}

function hasManualStrategyOverrides(overrides) {
  return Object.entries(overrides || {}).some(([key, value]) => {
    if (["possessionFlip", "freeThrowsPending", "timeoutCalled", "clockAdvanced", "scoreDiffRange"].includes(key)) {
      return Boolean(value);
    }
    return value !== "" && value != null;
  });
}

function teamShortLabel(team) {
  return team?.teamTricode || team?.teamName || "Team";
}

function periodLabel(period) {
  const numeric = safeNumber(period, 0);
  if (numeric <= 4) return `Q${numeric}`;
  return numeric === 5 ? "OT" : `${numeric - 4}OT`;
}

function buildTimeBand(seconds) {
  if (seconds > 60) return "over-60";
  if (seconds > 52) return "1:00-0:52";
  if (seconds > 40) return "0:52-0:40";
  if (seconds > 35) return "0:40-0:35";
  if (seconds > 30) return "0:35-0:30";
  if (seconds > 28) return "0:30-0:28";
  if (seconds > 26) return "0:28-0:26";
  if (seconds > 24) return "0:26-0:24";
  if (seconds > 20) return "0:24-0:20";
  if (seconds > 15) return "0:20-0:15";
  if (seconds > 10) return "0:15-0:10";
  if (seconds > 8) return "0:10-0:08";
  if (seconds > 7) return "0:08-0:07";
  if (seconds > 6) return "0:07-0:06";
  if (seconds > 5) return "0:06-0:05";
  if (seconds > 4) return "0:05-0:04";
  if (seconds > 3) return "0:04-0:03";
  if (seconds > 2) return "0:03-0:02";
  if (seconds > 1) return "0:02-0:01";
  return "0:01-0:00";
}

function buildPlayMode(scoreDiff, secondsRemaining) {
  if (Math.abs(scoreDiff) >= 20 && secondsRemaining < 360) {
    return {
      mode: "Retreat",
      instruction: "Rest starters",
      source: "Play Mode",
    };
  }
  if (Math.abs(scoreDiff) >= 15 && secondsRemaining < 180) {
    return {
      mode: "Retreat",
      instruction: "Rest starters",
      source: "Play Mode",
    };
  }
  if (Math.abs(scoreDiff) >= 10 && secondsRemaining < 60) {
    return {
      mode: "Retreat",
      instruction: "Rest starters",
      source: "Play Mode",
    };
  }

  if (scoreDiff <= -11 && secondsRemaining <= 359 && secondsRemaining >= 300) {
    return { mode: "Speed Up", instruction: "Shoot quick", source: "Play Mode" };
  }
  if (scoreDiff <= -10 && secondsRemaining <= 299 && secondsRemaining >= 240) {
    return { mode: "Speed Up", instruction: "Mostly 3's", source: "Play Mode" };
  }
  if (scoreDiff <= -9 && secondsRemaining <= 239 && secondsRemaining >= 180) {
    return { mode: "Speed Up", instruction: "Crash 5", source: "Play Mode" };
  }
  if (scoreDiff <= -6 && secondsRemaining <= 179 && secondsRemaining >= 120) {
    return { mode: "Speed Up", instruction: "Press", source: "Play Mode" };
  }
  if (scoreDiff <= -5 && secondsRemaining < 120) {
    return { mode: "Speed Up", instruction: "Press and extend", source: "Play Mode" };
  }

  if (scoreDiff >= 11 && secondsRemaining <= 359 && secondsRemaining >= 300) {
    return { mode: "Slow Down", instruction: "Shoot under 8", source: "Play Mode" };
  }
  if (scoreDiff >= 10 && secondsRemaining <= 299 && secondsRemaining >= 240) {
    return { mode: "Slow Down", instruction: "Press break", source: "Play Mode" };
  }
  if (scoreDiff >= 9 && secondsRemaining <= 239 && secondsRemaining >= 180) {
    return { mode: "Slow Down", instruction: "All 5 get back", source: "Play Mode" };
  }
  if (scoreDiff >= 6 && secondsRemaining <= 179 && secondsRemaining >= 120) {
    return { mode: "Slow Down", instruction: "Let ball roll", source: "Play Mode" };
  }
  if (scoreDiff >= 5 && secondsRemaining < 120) {
    return { mode: "Slow Down", instruction: "Let ball roll", source: "Play Mode" };
  }

  return null;
}

function latestPossessionTeamId(game) {
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    const candidate = action?.possession ?? action?.possessionTeamId ?? null;
    if (candidate == null || candidate === "" || String(candidate) === "0") continue;
    return String(candidate);
  }
  return null;
}

function latestPlayableAction(game) {
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (isAdministrativeAction(action)) continue;
    return action;
  }
  return null;
}

function actionSummary(action) {
  if (!action) return "No recent play-by-play action.";
  return String(action.description || action.actionType || "Unknown action").trim();
}

function actionSecondsRemaining(action) {
  return clockToSeconds(action?.clock);
}

function recentEventQueue(game, limit = 5) {
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  return actions
    .slice()
    .reverse()
    .filter((action) => !isAdministrativeAction(action))
    .slice(0, limit)
    .map((action) => ({
      actionType: String(action?.actionType || ""),
      period: safeNumber(action?.period, 0),
      clock: normalizeClock(action?.clock),
      teamId: action?.teamId ? String(action.teamId) : "",
      possessionTeamId: action?.possession || action?.possessionTeamId ? String(action.possession || action.possessionTeamId) : "",
      description: actionSummary(action),
    }));
}

function likelyPossessionChangeAction(action) {
  const type = String(action?.actionType || "").toLowerCase();
  const result = String(action?.shotResult || "").toLowerCase();
  const description = String(action?.description || "").toLowerCase();
  return (
    type === "turnover" ||
    type === "steal" ||
    type === "jumpball" ||
    (type === "2pt" && result === "made") ||
    (type === "3pt" && result === "made") ||
    (type === "freethrow" && /free throw\s+\d+\s+of\s+\d+/i.test(description) && result === "made")
  );
}

function buildFeedStatus(game, secondsRemaining) {
  const latestAction = latestPlayableAction(game);
  const latestActionSeconds = latestAction ? actionSecondsRemaining(latestAction) : null;
  const rawSecondsBehind = latestActionSeconds == null ? null : latestActionSeconds - secondsRemaining;
  const secondsBehind = rawSecondsBehind == null ? null : Math.max(0, rawSecondsBehind);
  const recentEvents = recentEventQueue(game);
  const sequenceFlags = [];

  if (!latestAction) {
    sequenceFlags.push("No playable action found in the feed.");
  } else if (secondsBehind > FEED_CONFIDENCE_MEDIUM_SECONDS) {
    sequenceFlags.push("Play-by-play clock is meaningfully behind the game clock.");
  } else if (secondsBehind > FEED_CONFIDENCE_HIGH_SECONDS) {
    sequenceFlags.push("Play-by-play clock is slightly behind the game clock.");
  }

  if (latestAction && likelyPossessionChangeAction(latestAction)) {
    sequenceFlags.push("Latest action may be part of a possession-change sequence.");
  }

  const latestType = String(latestAction?.actionType || "").toLowerCase();
  if (latestType === "foul") {
    sequenceFlags.push("Latest action is a foul; free throws, replay, or timeout context may arrive next.");
  }
  if (latestType === "freethrow") {
    const parsed = parseFreeThrowAttempt(latestAction);
    if (parsed && parsed.attempt < parsed.total) {
      sequenceFlags.push(`Free throw sequence is mid-trip: ${parsed.attempt} of ${parsed.total}.`);
    }
  }

  let level = "unknown";
  let label = "Feed confidence unknown";
  if (secondsBehind != null) {
    if (secondsBehind <= FEED_CONFIDENCE_HIGH_SECONDS) {
      level = "high";
      label = "Feed confidence high";
    } else if (secondsBehind <= FEED_CONFIDENCE_MEDIUM_SECONDS) {
      level = "medium";
      label = "Feed confidence medium";
    } else {
      level = "low";
      label = "Feed confidence low";
    }
  }

  return {
    level,
    label,
    secondsBehind,
    latestActionType: latestType,
    latestActionClock: latestAction ? normalizeClock(latestAction.clock) : "",
    latestActionDescription: actionSummary(latestAction),
    recentEvents,
    sequenceFlags,
  };
}

function flipPossessionTeamId(possessionTeamId, vantageTeam, opponentTeam) {
  const current = String(possessionTeamId || "");
  if (current === String(vantageTeam?.teamId || "")) return String(opponentTeam?.teamId || "");
  if (current === String(opponentTeam?.teamId || "")) return String(vantageTeam?.teamId || "");
  return String(vantageTeam?.teamId || "");
}

function isAdministrativeAction(action) {
  const type = String(action?.actionType || "").toLowerCase();
  return (
    type === "timeout" ||
    type === "substitution" ||
    type === "violation" ||
    type === "instantreplay" ||
    type === "ejection"
  );
}

function isTripBreakerAction(action) {
  const type = String(action?.actionType || "").toLowerCase();
  return (
    type === "2pt" ||
    type === "3pt" ||
    type === "turnover" ||
    type === "rebound" ||
    type === "steal" ||
    type === "block" ||
    type === "jumpball" ||
    type === "goaltending" ||
    type === "period"
  );
}

function parseFreeThrowAttempt(action) {
  if (String(action?.actionType || "").toLowerCase() !== "freethrow") return null;
  const description = String(action?.description || "");
  const match = /Free Throw\s+(\d+)\s+of\s+(\d+)/i.exec(description);
  if (!match) return null;
  return {
    attempt: safeNumber(match[1], 0),
    total: safeNumber(match[2], 0),
    made: String(action?.shotResult || "").toLowerCase() === "made",
    description,
  };
}

function isNonTechnicalDefensiveFoulByUs(action, ourTeamId) {
  if (String(action?.actionType || "").toLowerCase() !== "foul") return false;
  if (String(action?.teamId || "") !== String(ourTeamId || "")) return false;
  const subType = String(action?.subType || "").toLowerCase();
  const descriptor = String(action?.descriptor || action?.description || "").toLowerCase();
  if (subType === "offensive") return false;
  if (subType.includes("technical") || descriptor.includes("technical")) return false;
  return true;
}

function inferAwardedFreeThrows(actions, foulIndex, opponentTeamId) {
  const foulAction = actions[foulIndex];
  const descriptor = String(foulAction?.descriptor || foulAction?.description || "").toLowerCase();
  if (descriptor.includes("shoot")) {
    const previous = actions[foulIndex - 1];
    const previousType = String(previous?.actionType || "").toLowerCase();
    if (
      previous &&
      String(previous?.teamId || "") === String(opponentTeamId || "") &&
      previous?.clock === foulAction?.clock &&
      previousType === "3pt"
    ) {
      return 3;
    }
    return 2;
  }
  return null;
}

function buildFreeThrowLookahead(state, meta) {
  const totalAwarded = safeNumber(meta?.totalAwarded, 0);
  if (totalAwarded <= 0) return null;

  const attemptsTaken = safeNumber(meta?.attemptsTaken, 0);
  const madeSoFar = safeNumber(meta?.madeSoFar, 0);
  const remainingAttempts = Math.max(0, totalAwarded - attemptsTaken);
  const scenarios = [];

  for (let extraMakes = 0; extraMakes <= remainingAttempts; extraMakes += 1) {
    const finalMade = madeSoFar + extraMakes;
    const projectedScoreDiff = state.scoreDiff - extraMakes;
    const projectedState = {
      ...state,
      isOurPossession: true,
      scoreDiff: projectedScoreDiff,
      scoreLabel: scoreLabel(projectedScoreDiff),
    };
    const recommendation = offenseRecommendation(projectedState);
    scenarios.push({
      key: `${totalAwarded}-${attemptsTaken}-${finalMade}`,
      finalMade,
      totalAwarded,
      additionalMakes: extraMakes,
      projectedScoreDiff,
      projectedScoreLabel: scoreLabel(projectedScoreDiff),
      label: `If they finish ${finalMade} of ${totalAwarded}`,
      recommendation,
    });
  }

  if (!scenarios.length) return null;

  return {
    headline: "Next possession after free throws",
    summary: "The opponent is at the line. Project the next offensive decision before the ball comes back to us.",
    source: meta?.source || "opponent-free-throws",
    totalAwarded,
    attemptsTaken,
    madeSoFar,
    pendingAttempts: remainingAttempts,
    scenarios,
    notes: Array.isArray(meta?.notes) ? meta.notes : [],
  };
}

function findOpponentFreeThrowLookahead(state) {
  const actions = Array.isArray(state?.game?.playByPlayActions) ? state.game.playByPlayActions : [];
  if (!actions.length || !state?.vantageTeam?.teamId || !state?.opponentTeam?.teamId) return null;

  const ourTeamId = state.vantageTeam.teamId;
  const opponentTeamId = state.opponentTeam.teamId;
  const freeThrowAttempts = [];

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (state.period && safeNumber(action?.period, 0) && safeNumber(action.period, 0) < state.period) break;

    if (isAdministrativeAction(action)) continue;

    const freeThrowAttempt = parseFreeThrowAttempt(action);
    if (freeThrowAttempt && String(action?.teamId || "") === String(opponentTeamId)) {
      freeThrowAttempts.unshift(freeThrowAttempt);
      continue;
    }

    if (freeThrowAttempts.length) {
      if (isNonTechnicalDefensiveFoulByUs(action, ourTeamId)) {
        const awardedFromAttempts = freeThrowAttempts.reduce(
          (maxTotal, attempt) => Math.max(maxTotal, attempt.total),
          0
        );
        return buildFreeThrowLookahead(state, {
          source: "live-free-throw-sequence",
          totalAwarded: awardedFromAttempts,
          attemptsTaken: freeThrowAttempts.length,
          madeSoFar: freeThrowAttempts.filter((attempt) => attempt.made).length,
        });
      }
      if (isTripBreakerAction(action)) break;
      break;
    }

    if (isNonTechnicalDefensiveFoulByUs(action, ourTeamId)) {
      const inferredAward = inferAwardedFreeThrows(actions, index, opponentTeamId);
      if (inferredAward) {
        return buildFreeThrowLookahead(state, {
          source: "shooting-foul-pending",
          totalAwarded: inferredAward,
          attemptsTaken: 0,
          madeSoFar: 0,
        });
      }
      if (state.foulsToGive === 0) {
        return buildFreeThrowLookahead(state, {
          source: "penalty-foul-pending",
          totalAwarded: 2,
          attemptsTaken: 0,
          madeSoFar: 0,
          notes: ["Penalty trip inferred from team-foul state before the first free throw appears in the feed."],
        });
      }
      break;
    }

    if (isTripBreakerAction(action)) break;
    break;
  }

  return null;
}

export function buildLateGameStrategyState({
  game,
  vantageTeamId,
  awayFouls,
  homeFouls,
  awayTimeoutsRemaining,
  homeTimeoutsRemaining,
  manualOverrides = {},
}) {
  const awayTeam = game?.awayTeam || null;
  const homeTeam = game?.homeTeam || null;
  const normalizedVantageId = String(vantageTeamId || "").trim();
  const isAwayVantage = normalizedVantageId && normalizedVantageId === String(awayTeam?.teamId || "");
  const vantageTeam = isAwayVantage ? awayTeam : normalizedVantageId === String(homeTeam?.teamId || "") ? homeTeam : null;
  const opponentTeam = vantageTeam && vantageTeam === awayTeam ? homeTeam : vantageTeam && vantageTeam === homeTeam ? awayTeam : null;

  if (!game || !vantageTeam || !opponentTeam) {
    return null;
  }

  const period = overrideNumber(manualOverrides.period, safeNumber(game.period, 0), 1, 10);
  const clock = normalizeOverrideClock(manualOverrides.clock, normalizeClock(game.gameClock));
  const secondsRemaining = clockToSeconds(clock);
  const feedPossessionTeamId = latestPossessionTeamId(game);
  const overridePossessionTeamId = String(manualOverrides.possessionTeamId || "").trim();
  const possessionTeamId = overridePossessionTeamId
    ? overridePossessionTeamId
    : manualOverrides.possessionFlip
    ? flipPossessionTeamId(feedPossessionTeamId, vantageTeam, opponentTeam)
    : feedPossessionTeamId;
  const feedScoreDiff = safeNumber(vantageTeam.score, 0) - safeNumber(opponentTeam.score, 0);
  const scoreDiff = overrideNumber(manualOverrides.scoreDiff, feedScoreDiff, -99, 99);
  const feedOurTimeouts = isAwayVantage ? safeNumber(awayTimeoutsRemaining, 0) : safeNumber(homeTimeoutsRemaining, 0);
  const feedOpponentTimeouts = isAwayVantage ? safeNumber(homeTimeoutsRemaining, 0) : safeNumber(awayTimeoutsRemaining, 0);
  const feedOurFouls = isAwayVantage ? safeNumber(awayFouls, 0) : safeNumber(homeFouls, 0);
  const feedOpponentFouls = isAwayVantage ? safeNumber(homeFouls, 0) : safeNumber(awayFouls, 0);
  const ourTimeouts = overrideNumber(manualOverrides.ourTimeouts, feedOurTimeouts, 0, 7);
  const opponentTimeouts = overrideNumber(manualOverrides.opponentTimeouts, feedOpponentTimeouts, 0, 7);
  const ourFouls = overrideNumber(manualOverrides.ourFouls, feedOurFouls, 0, 5);
  const opponentFouls = overrideNumber(manualOverrides.opponentFouls, feedOpponentFouls, 0, 5);
  const isSimulation = hasManualStrategyOverrides(manualOverrides);

  return {
    game,
    isLive: game.gameStatus === 2,
    isSimulation,
    isLateGameWindow: period >= 4,
    period,
    periodLabel: periodLabel(period),
    clock,
    secondsRemaining,
    timeBand: buildTimeBand(secondsRemaining),
    possessionTeamId,
    feedPossessionTeamId,
    isOurPossession: possessionTeamId != null ? String(possessionTeamId) === String(vantageTeam.teamId) : null,
    scoreDiff,
    scoreLabel: scoreLabel(scoreDiff),
    vantageTeam,
    opponentTeam,
    ourTimeouts,
    opponentTimeouts,
    ourFouls,
    opponentFouls,
    foulsToGive: Math.max(0, 4 - ourFouls),
    opponentFoulsToGive: Math.max(0, 4 - opponentFouls),
    feedStatus: buildFeedStatus(game, secondsRemaining),
    manualOverrides: {
      possessionFlip: Boolean(manualOverrides.possessionFlip),
      freeThrowsPending: Boolean(manualOverrides.freeThrowsPending),
      timeoutCalled: Boolean(manualOverrides.timeoutCalled),
      clockAdvanced: Boolean(manualOverrides.clockAdvanced),
      period: manualOverrides.period ?? "",
      clock: manualOverrides.clock ?? "",
      scoreDiff: manualOverrides.scoreDiff ?? "",
      scoreDiffRange: Boolean(manualOverrides.scoreDiffRange),
      scoreDiffEnd: manualOverrides.scoreDiffEnd ?? "",
      possessionTeamId: overridePossessionTeamId,
      ourTimeouts: manualOverrides.ourTimeouts ?? "",
      opponentTimeouts: manualOverrides.opponentTimeouts ?? "",
      ourFouls: manualOverrides.ourFouls ?? "",
      opponentFouls: manualOverrides.opponentFouls ?? "",
    },
  };
}

function buildRecommendation(rule) {
  return {
    ...rule,
    notes: Array.isArray(rule.notes) ? rule.notes : [],
    blindSpots: Array.isArray(rule.blindSpots) ? rule.blindSpots : [],
  };
}

const WORKBOOK_TIME_BANDS = [
  "1:00-0:52.1",
  "0:52-0:40.1",
  "0:40-0:35.1",
  "0:35-0:30.1",
  "0:30-0:28.1",
  "0:28-0:26.1",
  "0:26-0:24.1",
  "0:24-0:20.1",
  "0:20-0:15.1",
  "0:15-0:10.1",
  "0:10-0:08.1",
  "0:08-0:07.1",
  "0:07-0:06.1",
  "0:06-0:05.1",
  "0:05-0:04.1",
  "0:04-0:03.1",
  "0:03-0:02.1",
  "0:02-0:01.1",
  "0:01-0:00.5",
];

const OFFENSE_MATRIX = {
  "1:00-0:52.1": { "-4": "NORMAL OFFENSE", "-3": "NORMAL OFFENSE", "-2": "NORMAL OFFENSE", "-1": "NORMAL OFFENSE", "0": "NORMAL OFFENSE", "1": "NORMAL OFFENSE", "2": "NORMAL OFFENSE", "3": "NORMAL OFFENSE" },
  "0:52-0:40.1": { "-4": "2 FOR 1", "-3": "2 FOR 1", "-2": "2 FOR 1", "-1": "2 FOR 1", "0": "2 FOR 1 / (GOOD SHOT ONLY)", "1": "2 FOR 1 / (GOOD SHOT ONLY)", "2": "SHOOT UNDER :08 ON SHOT CLOCK", "3": "SHOOT UNDER :08 ON SHOT CLOCK" },
  "0:40-0:35.1": { "-4": "2 FOR 1", "-3": "2 FOR 1", "-2": "2 FOR 1", "-1": "2 FOR 1", "0": "2 FOR 1 / (GOOD SHOT ONLY)", "1": "2 FOR 1 / (GOOD SHOT ONLY)", "2": "SHOOT UNDER :08 ON SHOT CLOCK", "3": "SHOOT UNDER :08 ON SHOT CLOCK" },
  "0:35-0:30.1": { "-4": "QUICK 2 FOR 1 (USE TIMEOUT IF WE HAVE 2)", "-3": "QUICK 2 FOR 1 (USE T/OUT IF HAVE 2)", "-2": "QUICK 2 FOR 1 (USE T/OUT IF HAVE 2)", "-1": "QUICK 2 FOR 1 (USE T/OUT IF HAVE 2)", "0": "QUICK 2 FOR 1 (USE T/OUT IF HAVE 2)", "1": "SHOOT UNDER :08 ON SHOT CLOCK", "2": "SHOOT UNDER :08 ON SHOT CLOCK", "3": "SHOOT UNDER :08 ON SHOT CLOCK" },
  "0:30-0:28.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "SHOOT UNDER :08 ON SHOT CLOCK", "1": "SHOOT UNDER :08 ON SHOT CLOCK", "2": "SHOOT UNDER :08 ON SHOT CLOCK", "3": "SHOOT UNDER :08 ON SHOT CLOCK" },
  "0:28-0:26.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "SHOOT UNDER :08 ON SHOT CLOCK", "1": "SHOOT UNDER :08 ON SHOT CLOCK", "2": "SHOOT UNDER :05 ON SHOT CLOCK", "3": "SHOOT UNDER :05 ON SHOT CLOCK" },
  "0:26-0:24.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "SHOOT UNDER :08 ON SHOT CLOCK", "1": "SHOOT UNDER :05 ON SHOT CLOCK.  BUT IF OPPONENT HAS NO TIMEOUT, SHOOT UNDER :03 ON SHOT CLOCK", "2": "SHOOT UNDER :05 ON SHOT CLOCK.  BUT IF OPPONENT HAS NO TIMEOUT, SHOOT UNDER :03 ON SHOT CLOCK", "3": "SHOOT UNDER :05 ON SHOT CLOCK.  BUT IF OPPONENT HAS NO TIMEOUT, SHOOT UNDER :03 ON SHOT CLOCK" },
  "0:24-0:20.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:20-0:15.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:15-0:10.1": { "-4": "QUICK 2 / OR / GOOD 3", "-3": "QUICK 2 / OR / GOOD 3", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:10-0:08.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:08-0:07.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:07-0:06.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:06-0:05.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:05-0:04.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "NEED 2 / BUT PREFER / 3", "-1": "NEED 2", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:04-0:03.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "LOB OR CATCH AND / SHOOT", "-1": "LOB OR CATCH AND / SHOOT", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:03-0:02.1": { "-4": "NEED 3 /  / *CRASH 5*", "-3": "NEED 3 /  / *CRASH 5*", "-2": "LOB OR CATCH AND / SHOOT", "-1": "LOB OR CATCH AND / SHOOT", "0": "HOLD BALL FOR LAST / SHOT", "1": "BALL SECURITY & PREPARE FOR FOUL", "2": "BALL SECURITY & PREPARE FOR FOUL", "3": "BALL SECURITY & PREPARE FOR FOUL" },
  "0:02-0:01.1": { "-4": "DRAW FOUL", "-3": "DRAW FOUL", "-2": "LOB / TIP", "-1": "LOB / TIP", "0": "LOB / TIP", "1": "SAFE INBOUNDS", "2": "SAFE INBOUNDS", "3": "SAFE INBOUNDS" },
  "0:01-0:00.5": { "-4": "DRAW FOUL", "-3": "DRAW FOUL", "-2": "LOB / TIP", "-1": "LOB / TIP", "0": "LOB / TIP", "1": "SAFE INBOUNDS", "2": "SAFE INBOUNDS", "3": "SAFE INBOUNDS" },
};

const DEFENSE_MATRIX = {
  "1:00-0:52.1": { "-5": "DEFEND NORMALLY", "-4": "DEFEND NORMALLY", "-3": "DEFEND NORMALLY", "-2": "DEFEND NORMALLY", "-1": "DEFEND NORMALLY", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "DEFEND NORMALLY", "4+": "DEFEND NORMALLY" },
  "0:52-0:40.1": { "-5": "1 TRAP, THEN FOUL", "-4": "DEFEND NORMALLY", "-3": "DEFEND NORMALLY", "-2": "DEFEND NORMALLY", "-1": "DEFEND NORMALLY", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "DEFEND NORMALLY", "4+": "DEFEND NORMALLY" },
  "0:40-0:35.1": { "-5": "1 TRAP, THEN FOUL", "-4": "DEFEND NORMALLY", "-3": "DEFEND NORMALLY", "-2": "DEFEND NORMALLY", "-1": "DEFEND NORMALLY", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "DEFEND NORMALLY", "4+": "DEFEND NORMALLY" },
  "0:35-0:30.1": { "-5": "1 TRAP, THEN FOUL", "-4": "1 TRAP, THEN FOUL", "-3": "DEFEND NORMALLY", "-2": "DEFEND NORMALLY", "-1": "DEFEND NORMALLY", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:30-0:28.1": { "-5": "FOUL", "-4": "1 TRAP,  THEN FOUL", "-3": "1 TRAP, THEN FOUL", "-2": "1 TRAP, THEN FOUL", "-1": "1 TRAP, THEN FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:28-0:26.1": { "-5": "FOUL", "-4": "1 TRAP,  THEN FOUL", "-3": "1 TRAP, THEN FOUL", "-2": "1 TRAP, THEN FOUL", "-1": "1 TRAP, THEN FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:26-0:24.1": { "-5": "FOUL", "-4": "FOUL", "-3": "1 TRAP, THEN FOUL", "-2": "1 TRAP, THEN FOUL", "-1": "1 TRAP, THEN FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:24-0:20.1": { "-5": "FOUL", "-4": "FOUL", "-3": "1 TRAP, THEN FOUL", "-2": "1 TRAP, THEN FOUL", "-1": "1 TRAP, THEN FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:20-0:15.1": { "-5": "FOUL", "-4": "FOUL", "-3": "1 TRAP, THEN FOUL", "-2": "1 TRAP, THEN FOUL", "-1": "1 TRAP, THEN FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:15-0:10.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:10-0:08.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:08-0:07.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:07-0:06.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:06-0:05.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:05-0:04.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "DEFEND NORMALLY", "1": "DEFEND NORMALLY", "2": "DEFEND NORMALLY", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:04-0:03.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "NO CATCH & SHOOT", "1": "NO CATCH & SHOOT", "2": "NO CATCH & SHOOT", "3": "FOUL", "4+": "NO 3 / DEFENSE" },
  "0:03-0:02.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "NO CATCH & SHOOT", "1": "NO CATCH & SHOOT", "2": "NO CATCH & SHOOT", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:02-0:01.1": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "NO CATCH & SHOOT", "1": "NO CATCH & SHOOT", "2": "NO CATCH & SHOOT", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
  "0:01-0:00.5": { "-5": "FOUL", "-4": "FOUL", "-3": "FOUL", "-2": "FOUL", "-1": "FOUL", "0": "NO FOULS. / ZONE THE RIM", "1": "NO FOULS. / ZONE THE RIM", "2": "NO FOULS. / ZONE THE RIM", "3": "NO 3 / DEFENSE", "4+": "NO 3 / DEFENSE" },
};

function workbookTimeBand(secondsRemaining) {
  if (secondsRemaining > 52) return "1:00-0:52.1";
  if (secondsRemaining > 40) return "0:52-0:40.1";
  if (secondsRemaining > 35) return "0:40-0:35.1";
  if (secondsRemaining > 30) return "0:35-0:30.1";
  if (secondsRemaining > 28) return "0:30-0:28.1";
  if (secondsRemaining > 26) return "0:28-0:26.1";
  if (secondsRemaining > 24) return "0:26-0:24.1";
  if (secondsRemaining > 20) return "0:24-0:20.1";
  if (secondsRemaining > 15) return "0:20-0:15.1";
  if (secondsRemaining > 10) return "0:15-0:10.1";
  if (secondsRemaining > 8) return "0:10-0:08.1";
  if (secondsRemaining > 7) return "0:08-0:07.1";
  if (secondsRemaining > 6) return "0:07-0:06.1";
  if (secondsRemaining > 5) return "0:06-0:05.1";
  if (secondsRemaining > 4) return "0:05-0:04.1";
  if (secondsRemaining > 3) return "0:04-0:03.1";
  if (secondsRemaining > 2) return "0:03-0:02.1";
  if (secondsRemaining > 1) return "0:02-0:01.1";
  return "0:01-0:00.5";
}

function offenseScoreBucket(scoreDiff) {
  if (scoreDiff <= -4) return "-4";
  if (scoreDiff >= 3) return "3";
  return String(scoreDiff);
}

function defenseScoreBucket(scoreDiff) {
  if (scoreDiff <= -5) return "-5";
  if (scoreDiff >= 4) return "4+";
  return String(scoreDiff);
}

function normalizeWorkbookInstruction(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/T\/OUT/g, "TIMEOUT")
    .replace(/,\s+,/g, ", ")
    .trim();
}

function workbookRuleId(side, band, bucket, rawInstruction) {
  const normalized = normalizeWorkbookInstruction(rawInstruction)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${side}-${band.replace(/[^0-9a-z]+/gi, "-").toLowerCase()}-${bucket.replace(/[^0-9a-z+_-]+/gi, "-")}-${normalized}`;
}

function recommendationFromWorkbookCell(side, band, bucket, rawInstruction, state) {
  const instruction = normalizeWorkbookInstruction(rawInstruction);
  const notes = [];
  const { ourTimeouts, opponentTimeouts, foulsToGive } = state;

  if (/TIMEOUT IF WE HAVE 2/.test(instruction)) {
    notes.push(`Timeouts remaining: ${ourTimeouts}.`);
  }
  if (/OPPONENT HAS NO TIMEOUT/.test(instruction)) {
    notes.push(`Opponent timeouts remaining: ${opponentTimeouts}.`);
  }
  if (/TRAP, THEN FOUL|^FOUL$|NO FOULS/.test(instruction)) {
    notes.push(`Fouls to give: ${foulsToGive}.`);
  }

  const recommendation = {
    ruleId: workbookRuleId(side, band, bucket, instruction),
    call: instruction,
    detail: "",
    rationale: `Direct lookup from Late Game Cells.xlsx for ${side === "our" ? "our possession" : "opponent possession"}, ${band}, score ${bucket}.`,
    notes,
  };

  switch (instruction) {
    case "NORMAL OFFENSE":
      recommendation.call = "Normal offense";
      recommendation.detail = "Run normal late-game offense.";
      break;
    case "DEFEND NORMALLY":
      recommendation.call = "Defend normally";
      recommendation.detail = "Stay home and finish the possession.";
      break;
    case "2 FOR 1":
      recommendation.call = "2 For 1";
      recommendation.detail = "Push for the extra possession.";
      break;
    case "2 FOR 1 / (GOOD SHOT ONLY)":
      recommendation.call = "2 For 1";
      recommendation.detail = "Good shot only.";
      break;
    case "QUICK 2 FOR 1 (USE TIMEOUT IF WE HAVE 2)":
    case "QUICK 2 FOR 1 (USE TIMEOUT IF HAVE 2)":
      recommendation.call = "Quick 2 For 1";
      recommendation.detail = "Use timeout if we have 2.";
      break;
    case "QUICK 2 / OR / GOOD 3":
      recommendation.call = "Quick 2 or good 3";
      recommendation.detail = "Attack immediately.";
      break;
    case "NEED 2 / BUT PREFER / 3":
      recommendation.call = "Need 2, prefer 3";
      recommendation.detail = "Take 2 unless a clean 3 is there.";
      break;
    case "NEED 2":
      recommendation.call = "Need 2";
      recommendation.detail = "Attack for a quick 2.";
      break;
    case "SHOOT UNDER :08 ON SHOT CLOCK":
      recommendation.call = "Late clock offense";
      recommendation.detail = "Shoot under :08 on the shot clock.";
      break;
    case "SHOOT UNDER :05 ON SHOT CLOCK":
      recommendation.call = "Late clock offense";
      recommendation.detail = "Shoot under :05 on the shot clock.";
      break;
    case "SHOOT UNDER :05 ON SHOT CLOCK. BUT IF OPPONENT HAS NO TIMEOUT, SHOOT UNDER :03 ON SHOT CLOCK":
      recommendation.call = "Late clock offense";
      recommendation.detail = opponentTimeouts > 0
        ? "Shoot under :05 on the shot clock."
        : "If they have no timeout, shoot under :03 on the shot clock.";
      break;
    case "HOLD BALL FOR LAST / SHOT":
      recommendation.call = "Hold for last shot";
      recommendation.detail = "Use clock to control the final possession.";
      break;
    case "BALL SECURITY & PREPARE FOR FOUL":
      recommendation.call = "Ball security";
      recommendation.detail = "Protect the ball and prepare for the foul game.";
      break;
    case "NEED 3 /  / *CRASH 5*":
    case "NEED 3 / / *CRASH 5*":
      recommendation.call = "Need 3";
      recommendation.detail = "Crash 5.";
      break;
    case "LOB OR CATCH AND / SHOOT":
      recommendation.call = "Lob or catch-and-shoot";
      recommendation.detail = "Quick-hitter only.";
      break;
    case "DRAW FOUL":
      recommendation.call = "Draw foul";
      recommendation.detail = "Attack body contact immediately.";
      break;
    case "LOB / TIP":
      recommendation.call = "Lob / tip";
      recommendation.detail = "Quick-hitter only.";
      break;
    case "SAFE INBOUNDS":
      recommendation.call = "Safe inbounds";
      recommendation.detail = "Value possession over advancement risk.";
      break;
    case "1 TRAP, THEN FOUL":
      recommendation.call = "1 trap, then foul";
      recommendation.detail = "Pressure first, then foul if no turnover.";
      break;
    case "FOUL":
      recommendation.call = "Foul";
      recommendation.detail = "Stop the clock immediately.";
      break;
    case "NO 3 / DEFENSE":
      recommendation.call = "No 3 defense";
      recommendation.detail = "Take away the arc first.";
      break;
    case "NO CATCH & SHOOT":
      recommendation.call = "No catch & shoot";
      recommendation.detail = "Take away the clean perimeter catch.";
      break;
    case "NO FOULS. / ZONE THE RIM":
      recommendation.call = "No fouls, zone the rim";
      recommendation.detail = "Protect the rim without bailing them out.";
      break;
    case "NO FOULS":
      recommendation.call = "No fouls";
      recommendation.detail = "Finish the possession without sending them to the line.";
      break;
    default:
      recommendation.call = instruction;
      recommendation.detail = "Follow the workbook cell literally.";
      break;
  }

  return buildRecommendation(recommendation);
}

function offenseRecommendation(state) {
  const band = workbookTimeBand(state.secondsRemaining);
  const bucket = offenseScoreBucket(state.scoreDiff);
  const rawInstruction = OFFENSE_MATRIX[band]?.[bucket];
  if (!rawInstruction) return null;
  return recommendationFromWorkbookCell("our", band, bucket, rawInstruction, state);
}

function defenseRecommendation(state) {
  const band = workbookTimeBand(state.secondsRemaining);
  const bucket = defenseScoreBucket(state.scoreDiff);
  const rawInstruction = DEFENSE_MATRIX[band]?.[bucket];
  if (!rawInstruction) return null;
  return recommendationFromWorkbookCell("opp", band, bucket, rawInstruction, state);
}

function recommendationForState(state) {
  if (state.isOurPossession == null) return null;
  return state.isOurPossession ? offenseRecommendation(state) : defenseRecommendation(state);
}

function buildProjectedNextRecommendation(state) {
  if (!state?.isLive || !state?.isLateGameWindow || state.secondsRemaining > FINAL_MINUTE_SECONDS) return null;
  if (state.isOurPossession == null) return null;

  const shouldProject =
    state.feedStatus?.level === "low" ||
    state.feedStatus?.level === "medium" ||
    Boolean(state.feedStatus?.sequenceFlags?.some((flag) => /possession-change|behind/i.test(flag)));

  if (!shouldProject) return null;

  const projectedPossessionTeamId = flipPossessionTeamId(
    state.possessionTeamId,
    state.vantageTeam,
    state.opponentTeam
  );
  const projectedState = {
    ...state,
    possessionTeamId: projectedPossessionTeamId,
    isOurPossession: String(projectedPossessionTeamId) === String(state.vantageTeam?.teamId || ""),
  };
  const recommendation = recommendationForState(projectedState);
  if (!recommendation) return null;

  return {
    headline: "Likely next if possession flips",
    summary: "Use this as a preparation view when the feed may be behind or mid-sequence.",
    possessionTeamId: projectedPossessionTeamId,
    isOurPossession: projectedState.isOurPossession,
    recommendation,
  };
}

function buildJumpBallLookahead(state) {
  if (!state?.vantageTeam?.teamId || !state?.opponentTeam?.teamId) return null;
  const winState = {
    ...state,
    possessionTeamId: state.vantageTeam.teamId,
    isOurPossession: true,
  };
  const loseState = {
    ...state,
    possessionTeamId: state.opponentTeam.teamId,
    isOurPossession: false,
  };
  const winRecommendation = recommendationForState(winState);
  const loseRecommendation = recommendationForState(loseState);
  if (!winRecommendation && !loseRecommendation) return null;

  return {
    headline: "Jump ball branches",
    summary: "Run both branches now: one if we win the tip, one if we defend.",
    scenarios: [
      {
        key: "jump-ball-win",
        label: "If we win jump ball",
        projectedScoreLabel: state.scoreLabel,
        recommendation: winRecommendation || buildRecommendation({
          call: "Normal offense",
          detail: "Run normal offense.",
        }),
      },
      {
        key: "jump-ball-lose",
        label: "If we lose jump ball",
        projectedScoreLabel: state.scoreLabel,
        recommendation: loseRecommendation || buildRecommendation({
          call: "Defend normally",
          detail: "Stay home and finish the possession.",
        }),
      },
    ],
    notes: [],
  };
}

export function evaluateLateGameStrategy(state) {
  if (!state) {
    return {
      status: "unavailable",
      headline: "Late Game Strategy unavailable",
      summary: "A full game state is required before the tool can evaluate the matrix.",
      notes: [],
      blindSpots: [],
    };
  }

  if (!state.isLive && !state.isSimulation) {
    return {
      status: "inactive",
      headline: "Late Game Strategy is inactive",
      summary: "Use manual overrides to simulate late-game states when the current game is not live.",
      notes: [],
      blindSpots: [],
    };
  }

  if (!state.isLateGameWindow) {
    return {
      status: "inactive",
      headline: "Late Game Strategy is Q4/OT-only",
      summary: "The panel stays visible all game, but the current rule set only evaluates Q4 and overtime end-game situations.",
      notes: [],
      blindSpots: [],
    };
  }

  const playMode = state.secondsRemaining <= PLAY_MODE_SECONDS
    ? buildPlayMode(state.scoreDiff, state.secondsRemaining)
    : null;

  if (state.secondsRemaining > FINAL_MINUTE_SECONDS) {
    return {
      status: "monitor",
      headline: "Play Mode active",
      summary: playMode
        ? `${playMode.mode}: ${playMode.instruction}. Primary matrix logic starts at 1:00.`
        : "Primary matrix logic starts at 1:00. Stay in normal late-game flow for now.",
      playMode,
      notes: playMode ? [`Source: ${playMode.source}.`] : [],
      blindSpots: [],
    };
  }

  const jumpBallLookahead = state.feedStatus?.latestActionType === "jumpball"
    ? buildJumpBallLookahead(state)
    : null;

  if (state.isOurPossession == null) {
    if (jumpBallLookahead) {
      return {
        status: "ready",
        headline: "Jump ball branches",
        summary: "Latest play is a jump ball. Use both offense and defense branches until possession resolves.",
        playMode,
        recommendation: jumpBallLookahead.scenarios[0]?.recommendation || null,
        notes: [],
        blindSpots: [],
        rationale: "Jump ball possession is unresolved in the feed.",
        jumpBallLookahead,
        freeThrowLookahead: null,
        projectedNext: null,
        feedStatus: state.feedStatus,
        matrixContext: {
          side: "Jump ball pending",
          timeBand: state.timeBand,
          scoreLabel: state.scoreLabel,
        },
      };
    }
    return {
      status: "review",
      headline: "Possession is unclear",
      summary: "The tool could not confidently identify possession from the live play-by-play feed.",
      playMode,
      notes: ["Use feedback to flag possession-read misses so we can harden the detection logic."],
      blindSpots: ["Possession inference currently depends on the latest play-by-play possession marker."],
    };
  }

  const recommendation = recommendationForState(state);
  const freeThrowLookahead = state.isOurPossession
    ? null
    : state.manualOverrides?.freeThrowsPending
      ? buildFreeThrowLookahead(state, {
        source: "manual-free-throws-pending",
        totalAwarded: 2,
        attemptsTaken: 0,
        madeSoFar: 0,
        notes: ["Manual override: treating the opponent as headed to the line for two free throws until the feed catches up."],
      })
      : findOpponentFreeThrowLookahead(state);
  const projectedNext = buildProjectedNextRecommendation(state);
  const feedNotes = [
    ...(state.feedStatus?.sequenceFlags || []),
    ...(state.manualOverrides?.timeoutCalled ? ["Manual override: timeout context may not be reflected in the feed yet."] : []),
    ...(state.manualOverrides?.clockAdvanced ? ["Manual override: clock may have advanced beyond the latest feed action."] : []),
    ...(state.manualOverrides?.possessionFlip ? ["Manual override: possession flipped from the official feed value."] : []),
  ];

  return {
    status: "ready",
    headline: recommendation.call,
    summary: recommendation.detail,
    playMode,
    recommendation,
    notes: [
      ...(state.isSimulation && !state.isLive ? ["Simulation mode: evaluating manual override inputs outside a live game."] : []),
      ...recommendation.notes,
      ...feedNotes,
    ],
    blindSpots: recommendation.blindSpots,
    rationale: recommendation.rationale,
    freeThrowLookahead,
    jumpBallLookahead,
    projectedNext,
    feedStatus: state.feedStatus,
    matrixContext: {
      side: `${state.isOurPossession ? teamShortLabel(state.vantageTeam) : teamShortLabel(state.opponentTeam)} possession`,
      timeBand: state.timeBand,
      scoreLabel: state.scoreLabel,
    },
  };
}
