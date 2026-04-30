import { normalizeClock } from "./utils.js";

const FINAL_MINUTE_SECONDS = 60;
const PLAY_MODE_SECONDS = 6 * 60;

export const LATE_GAME_FEEDBACK_TAGS = [
  "Possession wrong",
  "Time boundary",
  "Score bucket",
  "Too aggressive",
  "Too passive",
  "Timeout logic",
  "Foul-to-give",
  "No-3 logic",
  "Need-2 logic",
  "Last-shot logic",
  "Other",
];

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
    if (candidate != null && candidate !== "") return String(candidate);
  }
  return null;
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

  const period = safeNumber(game.period, 0);
  const clock = normalizeClock(game.gameClock);
  const secondsRemaining = clockToSeconds(clock);
  const possessionTeamId = latestPossessionTeamId(game);
  const scoreDiff = safeNumber(vantageTeam.score, 0) - safeNumber(opponentTeam.score, 0);
  const ourTimeouts = isAwayVantage ? safeNumber(awayTimeoutsRemaining, 0) : safeNumber(homeTimeoutsRemaining, 0);
  const opponentTimeouts = isAwayVantage ? safeNumber(homeTimeoutsRemaining, 0) : safeNumber(awayTimeoutsRemaining, 0);
  const ourFouls = isAwayVantage ? safeNumber(awayFouls, 0) : safeNumber(homeFouls, 0);
  const opponentFouls = isAwayVantage ? safeNumber(homeFouls, 0) : safeNumber(awayFouls, 0);

  return {
    game,
    isLive: game.gameStatus === 2,
    isLateGameWindow: period >= 4,
    period,
    periodLabel: periodLabel(period),
    clock,
    secondsRemaining,
    timeBand: buildTimeBand(secondsRemaining),
    possessionTeamId,
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
  };
}

function buildRecommendation(rule) {
  return {
    ...rule,
    notes: Array.isArray(rule.notes) ? rule.notes : [],
    blindSpots: Array.isArray(rule.blindSpots) ? rule.blindSpots : [],
  };
}

function offenseRecommendation(state) {
  const { scoreDiff, secondsRemaining, ourTimeouts, opponentTimeouts } = state;

  if (secondsRemaining > 52) {
    return buildRecommendation({
      ruleId: "offense-normal-under-60",
      call: "Normal",
      detail: "Run normal late-game offense.",
      rationale: "The matrix stays in normal offense above :52.",
      notes: ["No special end-game shot-clock modification yet."],
    });
  }
  if (secondsRemaining > 40) {
    if (scoreDiff <= -1 && scoreDiff >= -3) {
      return buildRecommendation({
        ruleId: "offense-2for1",
        call: "2 For 1",
        detail: "Push for the early clock advantage.",
        rationale: "This band maps to the 2-for-1 portion of the matrix when trailing 1 to 3.",
        notes: ["Prioritize a clean early attempt and preserve a second possession."],
      });
    }
    if (scoreDiff >= 0 && scoreDiff <= 1) {
      return buildRecommendation({
        ruleId: "offense-2for1-good-shot-only",
        call: "2 For 1",
        detail: "Good shot only.",
        rationale: "The matrix shifts tied or plus-1 possessions into a more selective 2-for-1.",
        notes: ["Do not force the first look if it compromises last-shot control."],
      });
    }
    if (scoreDiff >= 2) {
      return buildRecommendation({
        ruleId: "offense-shot-under-8",
        call: "Late clock offense",
        detail: "Shoot under :08 on the shot clock.",
        rationale: "Protect the lead while still getting a clean shot.",
      });
    }
  }
  if (secondsRemaining > 30) {
    return buildRecommendation({
      ruleId: "offense-quick-2for1",
      call: "Quick 2 For 1",
      detail: ourTimeouts >= 2 ? "Use timeout if we have 2." : "Play through unless a clean timeout is available.",
      rationale: "The :35 to :30 band is the matrix's quick 2-for-1 window.",
      notes: [`Timeouts remaining: ${ourTimeouts}.`],
    });
  }
  if (secondsRemaining > 24) {
    if (scoreDiff <= -3) {
      return buildRecommendation({
        ruleId: "offense-quick-2-or-good-3",
        call: "Quick 2 or good 3",
        detail: "Attack immediately.",
        rationale: "Down multiple possessions in the late-20s window calls for an early strike.",
      });
    }
    if (scoreDiff === -2) {
      return buildRecommendation({
        ruleId: "offense-need-2-prefer-3",
        call: "Need 2, prefer 3",
        detail: "Take 2 unless a clean 3 is there.",
        rationale: "This is one of the matrix's clearest split decisions.",
      });
    }
    if (scoreDiff === -1) {
      return buildRecommendation({
        ruleId: "offense-need-2",
        call: "Need 2",
        detail: "Attack for a quick score at the rim.",
        rationale: "The matrix turns one-possession deficits into an immediate 2-point priority.",
      });
    }
    if (scoreDiff === 0) {
      return buildRecommendation({
        ruleId: "offense-shoot-under-8",
        call: "Late clock offense",
        detail: "Shoot under :08 on the shot clock.",
        rationale: "The tied-game cell favors clock control without waiting too long.",
      });
    }
    if (scoreDiff >= 1) {
      return buildRecommendation({
        ruleId: "offense-shoot-under-5",
        call: "Late clock offense",
        detail: opponentTimeouts > 0 ? "Shoot under :05 on the shot clock." : "If they have no timeout, shoot under :03 if clean.",
        rationale: "Leading cells in this band prioritize draining more clock before the shot.",
        notes: [`Opponent timeouts remaining: ${opponentTimeouts}.`],
      });
    }
  }
  if (secondsRemaining > 10) {
    if (scoreDiff <= -3) {
      return buildRecommendation({
        ruleId: "offense-need-3-crash-5",
        call: "Need 3",
        detail: "Crash 5.",
        rationale: "The lower half of the matrix converts big deficits into an automatic 3-point chase.",
      });
    }
    if (scoreDiff === -2) {
      return buildRecommendation({
        ruleId: "offense-need-2-prefer-3-late",
        call: "Need 2, prefer 3",
        detail: "2 first, 3 if uncontested.",
        rationale: "Still down two possessions of value, but time pressure is increasing.",
      });
    }
    if (scoreDiff === -1) {
      return buildRecommendation({
        ruleId: "offense-need-2-late",
        call: "Need 2",
        detail: "Hit the paint fast.",
        rationale: "One-possession deficits still favor immediate 2-point conversion here.",
      });
    }
    if (scoreDiff >= 0 && scoreDiff <= 2) {
      return buildRecommendation({
        ruleId: "offense-hold-last-shot",
        call: "Hold for last shot",
        detail: "Use clock to control the final possession.",
        rationale: "The core blue section of the matrix is last-shot management while tied or protecting a small lead.",
      });
    }
    if (scoreDiff >= 3) {
      return buildRecommendation({
        ruleId: "offense-protect-lead",
        call: "Safe offense",
        detail: "Secure the ball and force free throws or a clean late look.",
        rationale: "The matrix becomes conservative when leading by more than one possession.",
      });
    }
  }
  if (secondsRemaining > 2) {
    if (scoreDiff <= -3) {
      return buildRecommendation({
        ruleId: "offense-draw-foul",
        call: "Draw foul",
        detail: "Attack body contact immediately.",
        rationale: "The bottom-left cells favor foul creation once the clock is nearly gone.",
      });
    }
    if (scoreDiff < 0) {
      return buildRecommendation({
        ruleId: "offense-lob-tip",
        call: "Lob / tip",
        detail: "Quick-hitter only.",
        rationale: "The matrix reduces to end-line special situations this late.",
      });
    }
    return buildRecommendation({
      ruleId: "offense-safe-inbounds",
      call: "Safe inbounds",
      detail: "Value possession over advancement risk.",
      rationale: "Leading or tied at the bottom of the matrix shifts to clean inbound security.",
    });
  }

  return buildRecommendation({
    ruleId: "offense-terminal",
    call: scoreDiff < 0 ? "Immediate shot" : "Secure ball",
    detail: "Final emergency possession.",
    rationale: "This is outside the matrix's fully readable detail and should be refined with feedback.",
    blindSpots: ["Sub-second inbound and tip rules need more explicit coaching detail."],
  });
}

function defenseRecommendation(state) {
  const { scoreDiff, secondsRemaining, foulsToGive } = state;

  if (secondsRemaining > 40) {
    if (scoreDiff <= -4) {
      return buildRecommendation({
        ruleId: "defense-trap-then-foul-early",
        call: "1 trap, then foul",
        detail: "Use pressure before stopping the clock.",
        rationale: "The matrix shows trailing teams escalating from normal defense into pressure before the final :40.",
        notes: [`Fouls to give: ${foulsToGive}.`],
      });
    }
    return buildRecommendation({
      ruleId: "defense-normal-early",
      call: "Defend normally",
      detail: "Stay home, no gambling yet.",
      rationale: "Most cells in the early portion of the defensive matrix stay normal.",
    });
  }
  if (secondsRemaining > 24) {
    if (scoreDiff <= -5) {
      return buildRecommendation({
        ruleId: "defense-foul-big-deficit",
        call: "Foul",
        detail: "Stop the clock immediately.",
        rationale: "Down multiple possessions with the clock draining forces the foul decision.",
      });
    }
    if (scoreDiff <= -2) {
      return buildRecommendation({
        ruleId: "defense-trap-then-foul-mid",
        call: "1 trap, then foul",
        detail: "Pressure first, then foul if no turnover.",
        rationale: "The central yellow block remains active for medium deficits in this band.",
      });
    }
    if (scoreDiff >= 3) {
      return buildRecommendation({
        ruleId: "defense-no-3-mid",
        call: "No 3 defense",
        detail: "Take away the arc first.",
        rationale: "Protecting a three-point lead becomes explicit in the matrix by the high-20s.",
      });
    }
    return buildRecommendation({
      ruleId: "defense-normal-mid",
      call: "Defend normally",
      detail: "Contain without fouling.",
      rationale: "Tight one-possession games stay in normal defense here.",
    });
  }
  if (secondsRemaining > 5) {
    if (scoreDiff <= -2) {
      return buildRecommendation({
        ruleId: "defense-foul-late",
        call: "Foul",
        detail: "Do not bleed more clock.",
        rationale: "Once the clock gets under :24, most trailing cells collapse into foul decisions.",
      });
    }
    if (scoreDiff >= 2) {
      return buildRecommendation({
        ruleId: "defense-no-3-late",
        call: "No 3 defense",
        detail: "Top-lock shooters and force the 2.",
        rationale: "Small leads this late are mostly protected by taking away the tying 3.",
      });
    }
    return buildRecommendation({
      ruleId: "defense-normal-late",
      call: "Defend normally",
      detail: "Stay solid and finish the possession.",
      rationale: "Tied and one-point margin cells remain in standard coverage before the final 5 seconds.",
    });
  }
  if (secondsRemaining > 2) {
    if (scoreDiff >= 2) {
      return buildRecommendation({
        ruleId: "defense-no-3-final",
        call: "No 3 defense",
        detail: "Switch everything above the arc.",
        rationale: "The matrix is explicit about no-3 behavior with a lead in the final seconds.",
      });
    }
    return buildRecommendation({
      ruleId: "defense-zone-rim",
      call: "No fouls, zone the rim",
      detail: "Take away direct catch-and-shoot windows.",
      rationale: "The lowest center-right defensive cells move into rim protection without fouling.",
      notes: [`Fouls to give: ${foulsToGive}.`],
    });
  }

  return buildRecommendation({
    ruleId: "defense-no-foul-terminal",
    call: scoreDiff >= 2 ? "No 3 defense" : "No fouls",
    detail: "Final emergency defense.",
    rationale: "The last second of the matrix needs finer special-situation detail.",
    blindSpots: ["Need explicit guidance for sub-second catch-and-shoot, foul-to-give, and switch rules."],
  });
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

  if (!state.isLive) {
    return {
      status: "inactive",
      headline: "Late Game Strategy is inactive",
      summary: "The live matrix panel only evaluates active game states.",
      notes: [],
      blindSpots: [],
    };
  }

  if (!state.isLateGameWindow) {
    return {
      status: "inactive",
      headline: "Late Game Strategy activates in Q4/OT",
      summary: "The current rule set is focused on Q4 and overtime end-game management.",
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

  if (state.isOurPossession == null) {
    return {
      status: "review",
      headline: "Possession is unclear",
      summary: "The tool could not confidently identify possession from the live play-by-play feed.",
      playMode,
      notes: ["Use feedback to flag possession-read misses so we can harden the detection logic."],
      blindSpots: ["Possession inference currently depends on the latest play-by-play possession marker."],
    };
  }

  const recommendation = state.isOurPossession
    ? offenseRecommendation(state)
    : defenseRecommendation(state);
  const freeThrowLookahead = state.isOurPossession ? null : findOpponentFreeThrowLookahead(state);

  return {
    status: "ready",
    headline: recommendation.call,
    summary: recommendation.detail,
    playMode,
    recommendation,
    notes: recommendation.notes,
    blindSpots: recommendation.blindSpots,
    rationale: recommendation.rationale,
    freeThrowLookahead,
    matrixContext: {
      side: state.isOurPossession ? "Our possession" : "Opponent possession",
      timeBand: state.timeBand,
      scoreLabel: state.scoreLabel,
    },
  };
}
