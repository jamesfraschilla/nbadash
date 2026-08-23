import { isSummerLeagueGameId } from "./summerLeagueGameSource.js";
import { normalizeClock } from "./utils.js";

const RUN_NET_THRESHOLD = 8;
const RUN_POINTS_THRESHOLD = 8;
const RUN_MAX_SECONDS = 7 * 60;
const RUN_ALERT_POINT_STEP = 6;
const RUN_ALERT_NET_STEP = 6;
const PLAYER_CREATED_SHARE_THRESHOLD = 60;
const PLAYER_CREATED_MIN_TEAM_POINTS = 12;
const PLAYER_CREATED_MIN_CREATED_POINTS = 8;
const PLAYER_CREATED_MIN_PERIOD_SECONDS = 3 * 60;
const PLAYER_CREATED_REPEAT_CREATED_STEP = 8;
const PLAYER_CREATED_REPEAT_SHARE_STEP = 15;
const PLAYER_CREATED_REPEAT_SECONDS = 5 * 60;
const TEAM_PERIOD_POINTS_THRESHOLD = 36;
const TEAM_PERIOD_BLOCKS_THRESHOLD = 5;
const TEAM_TREND_MAX_ALERTS = 8;
const TEAM_TREND_MIN_POINTS = 12;
const TEAM_TREND_MIN_FIELD_GOAL_ATTEMPTS = 10;
const TEAM_TREND_MIN_THREE_ATTEMPTS = 6;
const DEFAULT_MAX_ALERTS = 75;

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTeamId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePlayerId(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "0" ? normalized : null;
}

function opponentTeamId(teamId, homeTeamId, awayTeamId) {
  if (teamId === homeTeamId) return awayTeamId;
  if (teamId === awayTeamId) return homeTeamId;
  return null;
}

function teamLabel(team) {
  return team?.teamName || team?.teamTricode || "Team";
}

function teamCode(team) {
  return team?.teamTricode || team?.teamName || "TEAM";
}

function periodLengthSeconds(period, gameId) {
  if (safeNumber(period, 0) > 4) return 5 * 60;
  return isSummerLeagueGameId(gameId) ? 10 * 60 : 12 * 60;
}

function parseClockSeconds(clock) {
  const normalized = normalizeClock(String(clock || ""));
  const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(normalized);
  if (!match) return 0;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function actionElapsedSeconds(action, gameId) {
  const period = Math.max(1, safeNumber(action?.period, 1));
  let elapsed = 0;
  for (let currentPeriod = 1; currentPeriod < period; currentPeriod += 1) {
    elapsed += periodLengthSeconds(currentPeriod, gameId);
  }
  return elapsed + Math.max(0, periodLengthSeconds(period, gameId) - parseClockSeconds(action?.clock));
}

function periodElapsedSeconds(action, gameId) {
  const period = Math.max(1, safeNumber(action?.period, 1));
  return Math.max(0, periodLengthSeconds(period, gameId) - parseClockSeconds(action?.clock));
}

function periodShortLabel(period) {
  const numeric = safeNumber(period, 0);
  if (numeric <= 4) return `Q${numeric}`;
  return `OT${numeric - 4}`;
}

function clockLabel(clock) {
  const normalized = normalizeClock(String(clock || ""));
  return normalized || "--";
}

function shortClockLabel(clock) {
  return clockLabel(clock).replace(/^0+(?=\d:)/, "");
}

function clockPeriodLabel(action) {
  return `${periodShortLabel(action?.period)} ${shortClockLabel(action?.clock)}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatMadeAttemptPercent(made, attempted, label = "") {
  const suffix = label ? ` ${label}` : "";
  if (!attempted) return `0% (0/0${suffix})`;
  return `${formatPercent((made / attempted) * 100)} (${made}/${attempted}${suffix})`;
}

function lowResultQualifier(value) {
  return safeNumber(value, 0) > 0 ? "just " : "";
}

function formatStat(value, singularLabel, pluralLabel = singularLabel) {
  const numeric = safeNumber(value, 0);
  return `${numeric} ${numeric === 1 ? singularLabel : pluralLabel}`;
}

function playerContributionTitle(playerName, share, action) {
  const shareText = formatPercent(share);
  const periodText = periodShortLabel(action.period);
  if (parseClockSeconds(action.clock) > 0) {
    return `${playerName} has contributed to ${shareText} of the team's points so far in ${periodText}`;
  }
  return `${playerName} contributed to ${shareText} of the team's points in ${periodText}`;
}

function formatTripleDoubleStatLine(player) {
  const stats = [
    { value: player.points, label: "Pts" },
    { value: player.rebounds, label: "Reb" },
    { value: player.assists, label: "Ast" },
    { value: player.blocks, label: "Blk" },
    { value: player.steals, label: "Stl" },
  ]
    .filter((entry) => safeNumber(entry.value, 0) >= 8)
    .slice(0, 3);
  return stats.map((entry) => `${safeNumber(entry.value, 0)} ${entry.label}`).join(", ");
}

function parseScoreValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function fallbackScoringPoints(action) {
  if (!action || action.shotResult !== "Made") return 0;
  if (action.actionType === "3pt") return 3;
  if (action.actionType === "2pt") return 2;
  if (action.actionType === "freethrow") {
    const text = [
      action.subType,
      action.descriptor,
      action.description,
    ].join(" ");
    const valueMatch = /\b([123])\s*(?:pt|point)\b/i.exec(text);
    return valueMatch ? Number(valueMatch[1]) : 1;
  }
  return 0;
}

function compareActionsChronologically(a, b) {
  const orderDelta = safeNumber(a?.orderNumber ?? a?.actionNumber, 0)
    - safeNumber(b?.orderNumber ?? b?.actionNumber, 0);
  if (orderDelta !== 0) return orderDelta;
  const elapsedDelta = actionElapsedSeconds(a, "") - actionElapsedSeconds(b, "");
  if (elapsedDelta !== 0) return elapsedDelta;
  return safeNumber(a?.actionNumber, 0) - safeNumber(b?.actionNumber, 0);
}

function playerNameFromBase(player) {
  return [
    player?.firstName,
    player?.familyName,
  ].filter(Boolean).join(" ").trim()
    || player?.name
    || player?.playerName
    || player?.playerNameI
    || "";
}

function buildPlayerLookup(basePlayers) {
  const lookup = new Map();
  (basePlayers || []).forEach((player) => {
    const personId = normalizePlayerId(player?.personId);
    if (!personId) return;
    lookup.set(personId, {
      personId,
      teamId: normalizeTeamId(player?.teamId),
      name: playerNameFromBase(player),
      starter: isStarterPlayer(player),
    });
  });
  return lookup;
}

function isStarterPlayer(player) {
  const rawStarter =
    player?.starter ??
    player?.isStarter ??
    player?.starterStatus ??
    player?.starterFlag ??
    null;
  if (rawStarter === true) return true;
  const normalized = String(rawStarter || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "y" || normalized === "yes";
}

function starterIdsFromMinutes(minutesData, homeTeamId, awayTeamId) {
  const starters = {
    [homeTeamId]: new Set(),
    [awayTeamId]: new Set(),
  };
  const firstPeriod = (minutesData?.periods || []).find((period) => safeNumber(period?.period, 0) === 1);
  const firstStint = [...(firstPeriod?.stints || [])].sort((a, b) => {
    return parseClockSeconds(b?.startClock) - parseClockSeconds(a?.startClock);
  })[0];
  (firstStint?.playersHome || []).forEach((player) => {
    const personId = normalizePlayerId(player?.personId ?? player);
    if (personId) starters[homeTeamId]?.add(personId);
  });
  (firstStint?.playersAway || []).forEach((player) => {
    const personId = normalizePlayerId(player?.personId ?? player);
    if (personId) starters[awayTeamId]?.add(personId);
  });
  return starters;
}

function buildStarterLookup({ basePlayers, minutesData, homeTeamId, awayTeamId }) {
  const starters = starterIdsFromMinutes(minutesData, homeTeamId, awayTeamId);
  (basePlayers || []).forEach((player) => {
    const personId = normalizePlayerId(player?.personId);
    const teamId = normalizeTeamId(player?.teamId);
    if (!personId || !teamId || !isStarterPlayer(player)) return;
    if (!starters[teamId]) starters[teamId] = new Set();
    starters[teamId].add(personId);
  });
  return starters;
}

function createPlayerStats(personId, playerLookup, action = null) {
  const player = playerLookup.get(personId) || {};
  return {
    personId,
    teamId: player.teamId || normalizeTeamId(action?.teamId),
    name: player.name || action?.playerName || action?.playerNameI || "Player",
    points: 0,
    rebounds: 0,
    assists: 0,
    blocks: 0,
    steals: 0,
    fouls: 0,
    threes: 0,
    period: new Map(),
  };
}

function createPeriodStats() {
  return {
    points: 0,
    twoPointPoints: 0,
    assistedPoints: 0,
    assistedFieldGoalsMade: 0,
    assistedFieldGoalsAttempted: 0,
    assistedFieldGoalPoints: 0,
    unassistedFieldGoalsMade: 0,
    unassistedFieldGoalsAttempted: 0,
    unassistedFieldGoalPoints: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    freeThrowPoints: 0,
    benchPoints: 0,
    benchKnown: false,
    blocks: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threesMade: 0,
    threesAttempted: 0,
  };
}

function getPlayerStats(playerStats, personId, playerLookup, action = null) {
  if (!playerStats.has(personId)) {
    playerStats.set(personId, createPlayerStats(personId, playerLookup, action));
  }
  return playerStats.get(personId);
}

function getPlayerPeriodStats(player, period) {
  const key = String(period || "");
  if (!player.period.has(key)) {
    player.period.set(key, {
      points: 0,
      assists: 0,
      assistPoints: 0,
      rebounds: 0,
    });
  }
  return player.period.get(key);
}

function getTeamPeriodStats(teamPeriodStats, teamId, period) {
  const key = `${teamId}:${period}`;
  if (!teamPeriodStats.has(key)) teamPeriodStats.set(key, createPeriodStats());
  return teamPeriodStats.get(key);
}

function addAlert(alerts, seen, alert) {
  const id = alert.id || [
    alert.category,
    alert.period,
    alert.clock,
    alert.title,
    alert.detail,
  ].join(":");
  if (seen.has(id)) return false;
  seen.add(id);
  alerts.push({
    id,
    elapsed: safeNumber(alert.elapsed, 0),
    category: alert.category || "Alert",
    period: safeNumber(alert.period, 0),
    clock: alert.clock || "",
    periodLabel: periodShortLabel(alert.period),
    timeLabel: `${periodShortLabel(alert.period)} ${clockLabel(alert.clock)}`,
    title: alert.title,
    detail: alert.detail || "",
    teamId: alert.teamId || null,
  });
  return true;
}

function scoringEventFromAction(action, state, homeTeamId, awayTeamId) {
  const homeScore = parseScoreValue(action.scoreHome);
  const awayScore = parseScoreValue(action.scoreAway);
  const rawHomeDelta = homeScore == null ? 0 : Math.max(0, homeScore - state.previousHomeScore);
  const rawAwayDelta = awayScore == null ? 0 : Math.max(0, awayScore - state.previousAwayScore);
  const homeDelta = rawHomeDelta <= 4 ? rawHomeDelta : 0;
  const awayDelta = rawAwayDelta <= 4 ? rawAwayDelta : 0;
  const fallbackPoints = fallbackScoringPoints(action);
  let teamId = normalizeTeamId(action.teamId);
  let points = 0;

  if (homeDelta > 0 && (!teamId || teamId === homeTeamId)) {
    teamId = homeTeamId;
    points = homeDelta;
  } else if (awayDelta > 0 && (!teamId || teamId === awayTeamId)) {
    teamId = awayTeamId;
    points = awayDelta;
  } else if (fallbackPoints > 0 && teamId) {
    points = fallbackPoints;
  }

  if (homeScore != null) state.previousHomeScore = homeScore;
  if (awayScore != null) state.previousAwayScore = awayScore;

  if (!teamId || points <= 0) return null;
  return {
    action,
    teamId,
    points,
    period: safeNumber(action.period, 0),
    clock: action.clock,
    elapsed: actionElapsedSeconds(action, state.gameId),
    scoreHome: homeScore,
    scoreAway: awayScore,
  };
}

function statCount(stats, field) {
  return safeNumber(stats?.[field], 0);
}

function isSteppedMilestone(value, minimum, step = 1) {
  if (value < minimum) return false;
  if (step <= 1) return true;
  return value === minimum || (value > minimum && (value - minimum) % step === 0);
}

function doubleDoubleCategoryCount(player) {
  return [
    player.points,
    player.rebounds,
    player.assists,
    player.blocks,
    player.steals,
  ].filter((value) => safeNumber(value, 0) >= 10).length;
}

function thirdDoubleDoubleCategoryValue(player) {
  return [
    player.points,
    player.rebounds,
    player.assists,
    player.blocks,
    player.steals,
  ].sort((a, b) => b - a)[2] || 0;
}

function isApproachingTripleDouble(player, categoryCount) {
  if (categoryCount >= 3) return false;
  const topThree = [
    player.points,
    player.rebounds,
    player.assists,
    player.blocks,
    player.steals,
  ].map((value) => safeNumber(value, 0)).sort((a, b) => b - a).slice(0, 3);
  if (topThree.length < 3) return false;
  return topThree[0] >= 10 && topThree[2] >= 8 && topThree.reduce((sum, value) => sum + value, 0) >= 28;
}

function hasDoubleDoubleAlert(player, playerAchievementState) {
  return playerAchievementState.get(player.personId)?.doubleDouble;
}

function setPlayerAchievement(player, playerAchievementState, key) {
  const current = playerAchievementState.get(player.personId) || {};
  current[key] = true;
  playerAchievementState.set(player.personId, current);
}

function addPlayerAchievementAlerts({
  alerts,
  seen,
  player,
  action,
  teamId,
  playerAchievementState,
  gameId,
}) {
  const period = safeNumber(action.period, 0);
  const base = {
    period,
    clock: action.clock,
    elapsed: actionElapsedSeconds(action, gameId),
    teamId,
  };

  const categoryCount = doubleDoubleCategoryCount(player);
  const tripleDoubleStatLine = formatTripleDoubleStatLine(player);
  const nearTripleDouble =
    (categoryCount === 2 && thirdDoubleDoubleCategoryValue(player) >= 8) ||
    isApproachingTripleDouble(player, categoryCount);
  if (categoryCount >= 3 && !playerAchievementState.get(player.personId)?.tripleDouble) {
    setPlayerAchievement(player, playerAchievementState, "tripleDouble");
    addAlert(alerts, seen, {
      ...base,
      id: `triple-double:${player.personId}`,
      category: "Milestone",
      title: `${player.name} has a triple-double${tripleDoubleStatLine ? ` (${tripleDoubleStatLine})` : ""}`,
    });
  } else if (
    nearTripleDouble &&
    !playerAchievementState.get(player.personId)?.approachingTripleDouble
  ) {
    setPlayerAchievement(player, playerAchievementState, "approachingTripleDouble");
    addAlert(alerts, seen, {
      ...base,
      id: `approaching-triple-double:${player.personId}`,
      category: "Milestone",
      title: `${player.name} is approaching a triple-double${tripleDoubleStatLine ? ` (${tripleDoubleStatLine})` : ""}`,
    });
  }

  if (categoryCount >= 2 && !hasDoubleDoubleAlert(player, playerAchievementState)) {
    setPlayerAchievement(player, playerAchievementState, "doubleDouble");
    addAlert(alerts, seen, {
      ...base,
      id: `double-double:${player.personId}`,
      category: "Milestone",
      title: `${player.name} has a double-double`,
    });
  }
}

function addPlayerStatAlert({
  alerts,
  seen,
  player,
  action,
  teamId,
  category,
  statName,
  statPlural = statName,
  value,
  minimum,
  idPrefix,
  gameId,
  verb = "has totaled",
  step = 1,
}) {
  if (!isSteppedMilestone(value, minimum, step)) return;
  addAlert(alerts, seen, {
    id: `${idPrefix}:${player.personId}:${value}`,
    category,
    period: safeNumber(action.period, 0),
    clock: action.clock,
    elapsed: actionElapsedSeconds(action, gameId),
    teamId,
    title: `${player.name} ${verb} ${formatStat(value, statName, statPlural)}`,
  });
}

function addCreatedShareAlert({
  alerts,
  seen,
  player,
  action,
  teamId,
  teamPeriodPoints,
  gameId,
  createdShareState,
}) {
  const playerPeriod = getPlayerPeriodStats(player, action.period);
  const createdPoints = playerPeriod.points + playerPeriod.assistPoints;
  const periodElapsed = periodLengthSeconds(action.period, gameId) - parseClockSeconds(action.clock);
  if (
    teamPeriodPoints < PLAYER_CREATED_MIN_TEAM_POINTS ||
    createdPoints < PLAYER_CREATED_MIN_CREATED_POINTS ||
    periodElapsed < PLAYER_CREATED_MIN_PERIOD_SECONDS
  ) {
    return;
  }
  const share = teamPeriodPoints > 0 ? (createdPoints / teamPeriodPoints) * 100 : 0;
  if (share < PLAYER_CREATED_SHARE_THRESHOLD) return;

  const stateKey = `${player.personId}:${action.period}`;
  const previous = createdShareState.get(stateKey);
  if (previous) {
    const createdDelta = createdPoints - previous.createdPoints;
    const shareDelta = Math.abs(share - previous.share);
    const elapsedDelta = actionElapsedSeconds(action, gameId) - previous.elapsed;
    if (
      createdDelta < PLAYER_CREATED_REPEAT_CREATED_STEP &&
      shareDelta < PLAYER_CREATED_REPEAT_SHARE_STEP &&
      !(elapsedDelta >= PLAYER_CREATED_REPEAT_SECONDS && createdDelta >= PLAYER_CREATED_MIN_CREATED_POINTS / 2)
    ) {
      return;
    }
  }

  const elapsed = actionElapsedSeconds(action, gameId);
  const added = addAlert(alerts, seen, {
    id: `created-share:${action.actionNumber}:${player.personId}:${Math.round(share * 10)}`,
    category: "Player Impact",
    period: safeNumber(action.period, 0),
    clock: action.clock,
    elapsed,
    teamId,
    title: playerContributionTitle(player.name, share, action),
    detail: `${formatStat(playerPeriod.points, "Pt", "Pts")}, ${formatStat(playerPeriod.assists, "Ast")} (${formatStat(playerPeriod.assistPoints, "Pt", "Pts")} via Ast)`,
  });
  if (added) {
    createdShareState.set(stateKey, {
      createdPoints,
      elapsed,
      share,
    });
  }
}

function addRunAlerts({ alerts, seen, scoringEvents, teamsById }) {
  const runAlertState = new Map();
  for (let endIndex = 0; endIndex < scoringEvents.length; endIndex += 1) {
    const endEvent = scoringEvents[endIndex];
    let best = null;
    for (let startIndex = endIndex; startIndex >= 0; startIndex -= 1) {
      const startEvent = scoringEvents[startIndex];
      const duration = endEvent.elapsed - startEvent.elapsed;
      if (duration > RUN_MAX_SECONDS) break;
      if (startEvent.teamId !== endEvent.teamId) continue;

      let teamPoints = 0;
      let opponentPoints = 0;
      let beforeNet = 0;
      for (let index = startIndex; index <= endIndex; index += 1) {
        const event = scoringEvents[index];
        if (event.teamId === endEvent.teamId) {
          teamPoints += event.points;
        } else {
          opponentPoints += event.points;
        }
      }
      for (let index = 0; index < startIndex; index += 1) {
        const event = scoringEvents[index];
        beforeNet += event.teamId === endEvent.teamId ? event.points : -event.points;
      }
      if (
        teamPoints < RUN_POINTS_THRESHOLD ||
        teamPoints - opponentPoints < RUN_NET_THRESHOLD
      ) {
        continue;
      }
      const candidate = {
        startEvent,
        endEvent,
        duration,
        teamPoints,
        opponentPoints,
        net: teamPoints - opponentPoints,
        beforeNet,
        startIndex,
      };
      if (
        !best ||
        candidate.beforeNet < best.beforeNet ||
        (candidate.beforeNet === best.beforeNet && candidate.startIndex > best.startIndex) ||
        (candidate.beforeNet === best.beforeNet && candidate.startIndex === best.startIndex && candidate.teamPoints > best.teamPoints)
      ) {
        best = candidate;
      }
    }
    if (!best) continue;
    const previous = runAlertState.get(best.endEvent.teamId);
    const isSameRun = previous && best.startIndex <= previous.endIndex;
    if (isSameRun) {
      const pointDelta = best.teamPoints - previous.teamPoints;
      const netDelta = best.net - previous.net;
      if (pointDelta < RUN_ALERT_POINT_STEP && netDelta < RUN_ALERT_NET_STEP) {
        continue;
      }
    }
    const team = teamsById.get(best.endEvent.teamId);
    const added = addAlert(alerts, seen, {
      id: `run:${best.endEvent.action.actionNumber}:${best.startEvent.action.actionNumber}:${best.teamPoints}:${best.opponentPoints}`,
      category: "Run",
      period: best.endEvent.period,
      clock: best.endEvent.clock,
      elapsed: best.endEvent.elapsed,
      teamId: best.endEvent.teamId,
      title: `${teamLabel(team)} are on a ${best.teamPoints}-${best.opponentPoints} run over the last ${formatDuration(best.duration)}`,
      detail: `${clockPeriodLabel(best.startEvent.action)} to ${clockPeriodLabel(best.endEvent.action)}`,
    });
    if (added) {
      runAlertState.set(best.endEvent.teamId, {
        endIndex,
        net: best.net,
        teamPoints: best.teamPoints,
      });
    }
  }
}

function buildPeriodEndSummary({
  period,
  action,
  awayTeam,
  homeTeam,
  cumulativePlayerStats,
}) {
  const awayScore = parseScoreValue(action?.scoreAway) ?? safeNumber(awayTeam?.score, 0);
  const homeScore = parseScoreValue(action?.scoreHome) ?? safeNumber(homeTeam?.score, 0);
  const periodText = period === 2 ? "halftime" : `the end of ${periodShortLabel(period)}`;
  const awayLabel = teamLabel(awayTeam);
  const homeLabel = teamLabel(homeTeam);

  if (awayScore === homeScore) {
    return {
      title: period === 2
        ? `At halftime, the ${awayLabel} and the ${homeLabel} are tied at ${awayScore}`
        : `At ${periodText}, the ${awayLabel} and the ${homeLabel} are tied at ${awayScore}`,
      detail: buildLeaderSummary(cumulativePlayerStats, awayTeam, homeTeam),
    };
  }

  const leader = awayScore > homeScore ? awayTeam : homeTeam;
  const trailer = awayScore > homeScore ? homeTeam : awayTeam;
  const leaderScore = Math.max(awayScore, homeScore);
  const trailerScore = Math.min(awayScore, homeScore);
  return {
    title: period === 2
      ? `The ${teamLabel(leader)} lead the ${teamLabel(trailer)} at halftime, ${leaderScore}-${trailerScore}`
      : `At the end of ${periodShortLabel(period)}, the ${teamLabel(leader)} lead the ${teamLabel(trailer)}, ${leaderScore}-${trailerScore}`,
    detail: buildLeaderSummary(cumulativePlayerStats, awayTeam, homeTeam),
  };
}

function buildLeaderSummary(cumulativePlayerStats, awayTeam, homeTeam) {
  const awayLeader = findTeamLeader(cumulativePlayerStats, normalizeTeamId(awayTeam?.teamId));
  const homeLeader = findTeamLeader(cumulativePlayerStats, normalizeTeamId(homeTeam?.teamId));
  return [
    describeLeader(awayLeader, awayTeam),
    describeLeader(homeLeader, homeTeam),
  ].filter(Boolean).join(" Meanwhile, ");
}

function findTeamLeader(cumulativePlayerStats, teamId) {
  return [...cumulativePlayerStats.values()]
    .filter((player) => player.teamId === teamId && player.points > 0)
    .sort((a, b) => {
      const pointsDelta = b.points - a.points;
      if (pointsDelta !== 0) return pointsDelta;
      return b.rebounds + b.assists - (a.rebounds + a.assists);
    })[0] || null;
}

function describeLeader(player, team) {
  if (!player) return "";
  const extras = [];
  if (player.rebounds >= 3) extras.push(formatStat(player.rebounds, "Reb"));
  if (player.assists >= 3) extras.push(formatStat(player.assists, "Ast"));
  if (player.threes >= 2) extras.push(`${player.threes} 3PM`);
  const suffix = extras.length ? ` along with ${extras.join(" and ")}` : "";
  return `${player.name} leads the ${teamLabel(team)} with ${formatStat(player.points, "Pt", "Pts")}${suffix}.`;
}

function completedPeriodLimit(game, scoringEvents) {
  if (!scoringEvents.length) return 0;
  const currentPeriod = safeNumber(game?.period, 0);
  const status = safeNumber(game?.gameStatus, 0);
  if (status === 3) {
    return Math.max(currentPeriod, Math.max(...scoringEvents.map((event) => event.period)));
  }
  if (status === 2) {
    return Math.max(0, currentPeriod - 1);
  }
  return 0;
}

function shouldAddPeriodSummary(period, finalCompletedPeriod) {
  if (period <= 0) return false;
  if (period === finalCompletedPeriod && period >= 4) return false;
  return period <= 3 || period === 2;
}

function addPeriodEndAlerts({
  alerts,
  seen,
  game,
  awayTeam,
  homeTeam,
  scoringEvents,
  cumulativeSnapshotsByPeriod,
  teamCumulativeStatsByPeriod,
  teamPeriodStats,
  teamsById,
}) {
  const finalCompletedPeriod = completedPeriodLimit(game, scoringEvents);
  if (!finalCompletedPeriod) return;
  const teamTrendCandidates = [];

  for (let period = 1; period <= finalCompletedPeriod; period += 1) {
    const periodEvents = scoringEvents.filter((event) => event.period === period);
    const lastPeriodEvent = periodEvents[periodEvents.length - 1];
    if (!lastPeriodEvent) continue;
    const periodEndElapsed = actionElapsedSeconds({ period, clock: "0:00" }, game?.gameId);

    if (shouldAddPeriodSummary(period, finalCompletedPeriod)) {
      const summary = buildPeriodEndSummary({
        period,
        action: lastPeriodEvent.action,
        awayTeam,
        homeTeam,
        cumulativePlayerStats: cumulativeSnapshotsByPeriod.get(period) || new Map(),
      });
      addAlert(alerts, seen, {
        id: `period-summary:${period}`,
        category: period === 2 ? "Halftime" : "Quarter",
        period,
        clock: "0:00",
        elapsed: periodEndElapsed + 0.1,
        title: summary.title,
        detail: summary.detail,
      });
    }

    [awayTeam, homeTeam].forEach((team) => {
      const teamId = normalizeTeamId(team?.teamId);
      const periodStats = getTeamPeriodStats(teamPeriodStats, teamId, period);
      const cumulativeStats = teamCumulativeStatsByPeriod.get(`${teamId}:${period}`);
      const candidate = buildBestTeamTrendCandidate({
        team,
        teamId,
        period,
        periodStats,
        cumulativeStats,
        elapsed: periodEndElapsed,
      });
      if (candidate) teamTrendCandidates.push(candidate);
    });
  }

  teamTrendCandidates
    .sort((left, right) => {
      const strengthDelta = right.strength - left.strength;
      if (strengthDelta !== 0) return strengthDelta;
      const periodDelta = left.period - right.period;
      if (periodDelta !== 0) return periodDelta;
      return String(left.teamId).localeCompare(String(right.teamId));
    })
    .slice(0, TEAM_TREND_MAX_ALERTS)
    .sort((left, right) => left.elapsed - right.elapsed)
    .forEach((candidate) => {
      addAlert(alerts, seen, {
        id: candidate.id,
        category: "Team Trend",
        period: candidate.period,
        clock: "0:00",
        elapsed: candidate.elapsed,
        teamId: candidate.teamId,
        title: candidate.title,
        detail: candidate.detail,
      });
    });
}

function addTeamTrendCandidate(candidates, candidate) {
  if (!candidate?.title) return;
  candidates.push(candidate);
}

function buildAssistedShotDetail(stats) {
  return [
    `Assisted: ${stats.assistedFieldGoalsMade}/${stats.assistedFieldGoalsAttempted} FG (${stats.assistedFieldGoalPoints} Pts)`,
    `Unassisted: ${stats.unassistedFieldGoalsMade}/${stats.unassistedFieldGoalsAttempted} FG (${stats.unassistedFieldGoalPoints} Pts)`,
    `FT: ${stats.freeThrowsMade}/${stats.freeThrowsAttempted} (${stats.freeThrowPoints} Pts)`,
  ].join(", ");
}

function buildBestTeamTrendCandidate({
  team,
  teamId,
  period,
  periodStats,
  cumulativeStats,
  elapsed,
}) {
  if (!teamId || !periodStats || !cumulativeStats) return null;
  const candidates = [];
  const label = teamLabel(team);
  const periodLabel = periodShortLabel(period);
  const periodEndLabel = `through the end of ${periodLabel}`;

  if (cumulativeStats.points >= TEAM_TREND_MIN_POINTS) {
    const assistedShare = (cumulativeStats.assistedPoints / cumulativeStats.points) * 100;
    if (assistedShare >= 72) {
      addTeamTrendCandidate(candidates, {
        id: `trend-assisted-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.3,
        teamId,
        strength: assistedShare - 50 + 12,
        title: `${label} scored ${formatPercent(assistedShare)} of their points from assisted shots ${periodEndLabel}`,
        detail: buildAssistedShotDetail(cumulativeStats),
      });
    } else if (assistedShare <= 42) {
      addTeamTrendCandidate(candidates, {
        id: `trend-assisted-low:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.3,
        teamId,
        strength: 50 - assistedShare,
        title: `${label} scored ${lowResultQualifier(assistedShare)}${formatPercent(assistedShare)} of their points from assisted shots ${periodEndLabel}`,
        detail: buildAssistedShotDetail(cumulativeStats),
      });
    }

    const benchShare = (cumulativeStats.benchPoints / cumulativeStats.points) * 100;
    if (cumulativeStats.benchKnown && benchShare >= 55) {
      addTeamTrendCandidate(candidates, {
        id: `trend-bench-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.4,
        teamId,
        strength: benchShare - 35,
        title: `${label} scored ${formatPercent(benchShare)} of their points from the bench ${periodEndLabel}`,
      });
    }
  }

  if (periodStats.points >= TEAM_TREND_MIN_POINTS) {
    const twoPointShare = (periodStats.twoPointPoints / periodStats.points) * 100;
    if (twoPointShare >= 75) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-two-point-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.2,
        teamId,
        strength: twoPointShare - 45,
        title: `${label} scored ${formatPercent(twoPointShare)} of their points from 2pt shots in ${periodLabel}`,
      });
    }
  }

  if (periodStats.fieldGoalsAttempted >= TEAM_TREND_MIN_FIELD_GOAL_ATTEMPTS) {
    const fieldGoalPercent = (periodStats.fieldGoalsMade / periodStats.fieldGoalsAttempted) * 100;
    if (fieldGoalPercent >= 56) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-fg-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.5,
        teamId,
        strength: fieldGoalPercent - 34,
        title: `${label} shot ${formatMadeAttemptPercent(periodStats.fieldGoalsMade, periodStats.fieldGoalsAttempted, "FG")} overall in ${periodLabel}`,
      });
    } else if (fieldGoalPercent <= 38) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-fg-low:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.5,
        teamId,
        strength: 48 - fieldGoalPercent,
        title: `${label} shot ${lowResultQualifier(fieldGoalPercent)}${formatMadeAttemptPercent(periodStats.fieldGoalsMade, periodStats.fieldGoalsAttempted, "FG")} overall in ${periodLabel}`,
      });
    }

    const threeAttemptRate = (periodStats.threesAttempted / periodStats.fieldGoalsAttempted) * 100;
    if (periodStats.threesAttempted >= TEAM_TREND_MIN_THREE_ATTEMPTS && threeAttemptRate >= 45) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-three-volume-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.6,
        teamId,
        strength: threeAttemptRate - 20,
        title: `${label} took ${formatPercent(threeAttemptRate)} of their shots from three in ${periodLabel} (${periodStats.threesAttempted}/${periodStats.fieldGoalsAttempted} 3FG)`,
      });
    }
  }

  if (periodStats.threesAttempted >= TEAM_TREND_MIN_THREE_ATTEMPTS) {
    const threePercent = (periodStats.threesMade / periodStats.threesAttempted) * 100;
    if (threePercent >= 45) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-three-pct-high:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.7,
        teamId,
        strength: threePercent - 25,
        title: `${label} shot ${formatMadeAttemptPercent(periodStats.threesMade, periodStats.threesAttempted, "3FG")} from three in ${periodLabel}`,
      });
    } else if (threePercent <= 20) {
      addTeamTrendCandidate(candidates, {
        id: `trend-period-three-pct-low:${teamId}:${period}`,
        period,
        elapsed: elapsed + 0.7,
        teamId,
        strength: 35 - threePercent,
        title: `${label} shot ${lowResultQualifier(threePercent)}${formatMadeAttemptPercent(periodStats.threesMade, periodStats.threesAttempted, "3FG")} from three in ${periodLabel}`,
      });
    }
  }

  return candidates.sort((left, right) => right.strength - left.strength)[0] || null;
}

function clonePlayerStats(playerStats) {
  const next = new Map();
  playerStats.forEach((player, personId) => {
    next.set(personId, {
      ...player,
      period: new Map(player.period),
    });
  });
  return next;
}

function cloneTeamCumulativeStats(teamCumulativeStats, period) {
  const next = new Map();
  teamCumulativeStats.forEach((stats, teamId) => {
    next.set(`${teamId}:${period}`, { ...stats });
  });
  return next;
}

function updateTeamShootingStats(action, teamStats) {
  if (!teamStats) return;
  if (action.actionType === "freethrow") {
    teamStats.freeThrowsAttempted += 1;
    if (action.shotResult === "Made") teamStats.freeThrowsMade += 1;
    return;
  }
  if (action.actionType !== "2pt" && action.actionType !== "3pt") return;
  teamStats.fieldGoalsAttempted += 1;
  if (action.actionType === "3pt") teamStats.threesAttempted += 1;
  if (action.assistPersonId) {
    teamStats.assistedFieldGoalsAttempted += 1;
  } else {
    teamStats.unassistedFieldGoalsAttempted += 1;
  }
  if (action.shotResult !== "Made") return;
  teamStats.fieldGoalsMade += 1;
  if (action.actionType === "3pt") teamStats.threesMade += 1;
  if (action.assistPersonId) {
    teamStats.assistedFieldGoalsMade += 1;
  } else {
    teamStats.unassistedFieldGoalsMade += 1;
  }
}

function updateTeamScoringBreakdown(action, scoringEvent, ...teamStatsList) {
  teamStatsList.filter(Boolean).forEach((teamStats) => {
    if (action.actionType === "freethrow") {
      teamStats.freeThrowPoints += scoringEvent.points;
    } else if (action.actionType === "2pt" || action.actionType === "3pt") {
      if (action.assistPersonId) {
        teamStats.assistedFieldGoalPoints += scoringEvent.points;
      } else {
        teamStats.unassistedFieldGoalPoints += scoringEvent.points;
      }
    }
  });
}

function addFirstPointsAlert({ alerts, seen, event, teamsById }) {
  const team = teamsById.get(event.teamId);
  addAlert(alerts, seen, {
    id: "first-points",
    category: "First Score",
    period: event.period,
    clock: event.clock,
    elapsed: event.elapsed,
    teamId: event.teamId,
    title: `The ${teamLabel(team)} scored the first points of the game`,
  });
}

function addTeamPeriodPointAlert({ alerts, seen, team, teamId, period, action, periodPoints, gameId }) {
  if (safeNumber(period, 0) < 3) return;
  if (!isSteppedMilestone(periodPoints, TEAM_PERIOD_POINTS_THRESHOLD, 4)) return;
  addAlert(alerts, seen, {
    id: `team-period-points:${teamId}:${period}:${periodPoints}`,
    category: "Team Scoring",
    period,
    clock: action.clock,
    elapsed: actionElapsedSeconds(action, gameId),
    teamId,
    title: `${teamLabel(team)} have totaled ${formatStat(periodPoints, "Pt", "Pts")} in ${periodShortLabel(period)}`,
  });
}

function addPlayerPeriodPointAlert({ alerts, seen, player, action, teamId, periodPoints, gameId }) {
  const periodElapsed = periodElapsedSeconds(action, gameId);
  if (periodPoints >= 8 && periodElapsed <= 3 * 60) {
    if (!isSteppedMilestone(periodPoints, 8, 4)) return;
    addAlert(alerts, seen, {
      id: `player-period-start-points:${player.personId}:${action.period}:${periodPoints}`,
      category: "Player Scoring",
      period: safeNumber(action.period, 0),
      clock: action.clock,
      elapsed: actionElapsedSeconds(action, gameId),
      teamId,
      title: `${player.name} has put up ${formatStat(periodPoints, "Pt", "Pts")} to start ${periodShortLabel(action.period)}`,
    });
  } else if (periodPoints >= 12) {
    if (!isSteppedMilestone(periodPoints, 12, 4)) return;
    addAlert(alerts, seen, {
      id: `player-period-points:${player.personId}:${action.period}:${periodPoints}`,
      category: "Player Scoring",
      period: safeNumber(action.period, 0),
      clock: action.clock,
      elapsed: actionElapsedSeconds(action, gameId),
      teamId,
      title: `${player.name} has totaled ${formatStat(periodPoints, "Pt", "Pts")} in ${periodShortLabel(action.period)}`,
    });
  }
}

function addTeamPeriodBlockAlert({ alerts, seen, team, teamId, period, action, blocks, gameId }) {
  if (!isSteppedMilestone(blocks, TEAM_PERIOD_BLOCKS_THRESHOLD, 2)) return;
  addAlert(alerts, seen, {
    id: `team-period-blocks:${teamId}:${period}:${blocks}`,
    category: "Defense",
    period,
    clock: action.clock,
    elapsed: actionElapsedSeconds(action, gameId),
    teamId,
    title: `${teamLabel(team)} have totaled ${formatStat(blocks, "Blk")} in ${periodShortLabel(period)}`,
  });
}

function alertPruneScore(alert) {
  switch (alert?.category) {
    case "Player Impact":
      return 90;
    case "Player Scoring":
    case "Rebounding":
    case "Defense":
    case "Playmaking":
    case "Foul Trouble":
      return 75;
    case "Team Scoring":
      return 55;
    case "Run":
      return 35;
    case "Team Trend":
    case "Scoring Source":
      return 10;
    case "Milestone":
      return 5;
    case "First Score":
    case "Quarter":
    case "Halftime":
      return 0;
    default:
      return 50;
  }
}

function limitAlertsByPriority(sortedAlerts, maxAlerts) {
  const limit = Math.max(0, Math.floor(safeNumber(maxAlerts, DEFAULT_MAX_ALERTS)));
  if (limit <= 0) return [];
  if (sortedAlerts.length <= limit) return sortedAlerts;
  const removeCount = sortedAlerts.length - limit;
  const removalQueue = sortedAlerts
    .map((alert, index) => ({
      index,
      score: alertPruneScore(alert),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return left.index - right.index;
    });
  const removeIndexes = new Set(removalQueue.slice(0, removeCount).map((entry) => entry.index));
  return sortedAlerts.filter((_, index) => !removeIndexes.has(index));
}

export function buildGameAlerts({
  game,
  awayTeam = game?.awayTeam,
  homeTeam = game?.homeTeam,
  basePlayers = [],
  minutesData = null,
  maxAlerts = DEFAULT_MAX_ALERTS,
} = {}) {
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions : [];
  const awayTeamId = normalizeTeamId(awayTeam?.teamId);
  const homeTeamId = normalizeTeamId(homeTeam?.teamId);
  if (!actions.length || !awayTeamId || !homeTeamId) return [];

  const teamsById = new Map([
    [awayTeamId, awayTeam],
    [homeTeamId, homeTeam],
  ]);
  const orderedActions = [...actions].sort(compareActionsChronologically);
  const playerLookup = buildPlayerLookup(basePlayers);
  const starterLookup = buildStarterLookup({ basePlayers, minutesData, homeTeamId, awayTeamId });
  const alerts = [];
  const seen = new Set();
  const scoringEvents = [];
  const playerStats = new Map();
  const teamPeriodStats = new Map();
  const teamCumulativeStats = new Map([
    [awayTeamId, createPeriodStats()],
    [homeTeamId, createPeriodStats()],
  ]);
  const cumulativeSnapshotsByPeriod = new Map();
  const teamCumulativeStatsByPeriod = new Map();
  const playerAchievementState = new Map();
  const createdShareState = new Map();
  const scoreState = {
    gameId: game?.gameId,
    previousHomeScore: 0,
    previousAwayScore: 0,
  };
  let lastProcessedPeriod = 0;

  orderedActions.forEach((action) => {
    const period = safeNumber(action?.period, 0);
    if (!period) return;
    while (lastProcessedPeriod > 0 && lastProcessedPeriod < period) {
      cumulativeSnapshotsByPeriod.set(lastProcessedPeriod, clonePlayerStats(playerStats));
      cloneTeamCumulativeStats(teamCumulativeStats, lastProcessedPeriod).forEach((stats, key) => {
        teamCumulativeStatsByPeriod.set(key, stats);
      });
      lastProcessedPeriod += 1;
    }
    if (!lastProcessedPeriod) lastProcessedPeriod = period;

    const teamId = normalizeTeamId(action.teamId);
    const team = teamsById.get(teamId);
    if (teamId && teamCumulativeStats.has(teamId)) {
      const periodStats = getTeamPeriodStats(teamPeriodStats, teamId, period);
      updateTeamShootingStats(action, periodStats);
      updateTeamShootingStats(action, teamCumulativeStats.get(teamId));
    }

    const scoringEvent = scoringEventFromAction(action, scoreState, homeTeamId, awayTeamId);
    if (scoringEvent) {
      scoringEvents.push(scoringEvent);
      if (scoringEvents.length === 1) {
        addFirstPointsAlert({ alerts, seen, event: scoringEvent, teamsById });
      }

      const periodStats = getTeamPeriodStats(teamPeriodStats, scoringEvent.teamId, period);
      const cumulativeStats = teamCumulativeStats.get(scoringEvent.teamId);
      periodStats.points += scoringEvent.points;
      cumulativeStats.points += scoringEvent.points;
      updateTeamScoringBreakdown(action, scoringEvent, periodStats, cumulativeStats);
      if (action.actionType === "2pt") {
        periodStats.twoPointPoints += scoringEvent.points;
        cumulativeStats.twoPointPoints += scoringEvent.points;
      }
      if (action.assistPersonId) {
        periodStats.assistedPoints += scoringEvent.points;
        cumulativeStats.assistedPoints += scoringEvent.points;
      }

      const scorerId = normalizePlayerId(action.personId);
      if (scorerId) {
        const player = getPlayerStats(playerStats, scorerId, playerLookup, action);
        player.teamId = player.teamId || scoringEvent.teamId;
        player.points += scoringEvent.points;
        if (action.actionType === "3pt") player.threes += 1;
        const playerPeriod = getPlayerPeriodStats(player, period);
        playerPeriod.points += scoringEvent.points;

        const starterIds = starterLookup[scoringEvent.teamId];
        if (starterIds?.size >= 5) {
          periodStats.benchKnown = true;
          cumulativeStats.benchKnown = true;
          if (!starterIds.has(scorerId)) {
            periodStats.benchPoints += scoringEvent.points;
            cumulativeStats.benchPoints += scoringEvent.points;
          }
        }

        if (player.points === 16 || player.points === 20 || (player.points > 20 && player.points % 5 === 0)) {
          addPlayerStatAlert({
            alerts,
            seen,
            player,
            action,
            teamId: scoringEvent.teamId,
            category: "Player Scoring",
            statName: "Pt",
            statPlural: "Pts",
            value: player.points,
            minimum: player.points,
            idPrefix: "player-points",
            gameId: game?.gameId,
          });
        }
        addPlayerPeriodPointAlert({
          alerts,
          seen,
          player,
          action,
          teamId: scoringEvent.teamId,
          periodPoints: playerPeriod.points,
          gameId: game?.gameId,
        });
        addCreatedShareAlert({
          alerts,
          seen,
          player,
          action,
          teamId: scoringEvent.teamId,
          teamPeriodPoints: periodStats.points,
          gameId: game?.gameId,
          createdShareState,
        });
        addPlayerAchievementAlerts({
          alerts,
          seen,
          player,
          action,
          teamId: scoringEvent.teamId,
          playerAchievementState,
          gameId: game?.gameId,
        });
      }

      const assisterId = normalizePlayerId(action.assistPersonId);
      if (assisterId) {
        const assister = getPlayerStats(playerStats, assisterId, playerLookup, {
          ...action,
          personId: action.assistPersonId,
          playerNameI: action.assistPlayerNameI,
        });
        assister.teamId = assister.teamId || scoringEvent.teamId;
        assister.assists += 1;
        const assisterPeriod = getPlayerPeriodStats(assister, period);
        assisterPeriod.assists += 1;
        assisterPeriod.assistPoints += scoringEvent.points;
        addCreatedShareAlert({
          alerts,
          seen,
          player: assister,
          action,
          teamId: scoringEvent.teamId,
          teamPeriodPoints: periodStats.points,
          gameId: game?.gameId,
          createdShareState,
        });
        addPlayerStatAlert({
          alerts,
          seen,
          player: assister,
          action,
          teamId: scoringEvent.teamId,
          category: "Playmaking",
          statName: "Ast",
          value: assister.assists,
          minimum: 10,
          idPrefix: "player-assists",
          gameId: game?.gameId,
          verb: "has dished out",
          step: 2,
        });
        addPlayerAchievementAlerts({
          alerts,
          seen,
          player: assister,
          action,
          teamId: scoringEvent.teamId,
          playerAchievementState,
          gameId: game?.gameId,
        });
      }

      addTeamPeriodPointAlert({
        alerts,
        seen,
        team: teamsById.get(scoringEvent.teamId),
        teamId: scoringEvent.teamId,
        period,
        action,
        periodPoints: periodStats.points,
        gameId: game?.gameId,
      });
    }

    const linkedBlockPersonId = normalizePlayerId(action.blockPersonId);
    if (linkedBlockPersonId && action.actionType !== "block") {
      const blockTeamId = opponentTeamId(teamId, homeTeamId, awayTeamId);
      const blockTeam = teamsById.get(blockTeamId);
      if (blockTeamId && blockTeam) {
        const blockAction = {
          ...action,
          teamId: blockTeamId,
          personId: linkedBlockPersonId,
          playerName: action.blockPlayerName || action.blockPlayerNameI,
          playerNameI: action.blockPlayerNameI || action.blockPlayerName,
        };
        const blocker = getPlayerStats(playerStats, linkedBlockPersonId, playerLookup, blockAction);
        blocker.teamId = blocker.teamId || blockTeamId;
        blocker.blocks += 1;
        const blockPeriodStats = getTeamPeriodStats(teamPeriodStats, blockTeamId, period);
        blockPeriodStats.blocks += 1;
        addPlayerStatAlert({
          alerts,
          seen,
          player: blocker,
          action,
          teamId: blockTeamId,
          category: "Defense",
          statName: "Blk",
          value: blocker.blocks,
          minimum: 3,
          idPrefix: "player-blocks",
          gameId: game?.gameId,
          step: 2,
        });
        addTeamPeriodBlockAlert({
          alerts,
          seen,
          team: blockTeam,
          teamId: blockTeamId,
          period,
          action,
          blocks: blockPeriodStats.blocks,
          gameId: game?.gameId,
        });
        addPlayerAchievementAlerts({
          alerts,
          seen,
          player: blocker,
          action,
          teamId: blockTeamId,
          playerAchievementState,
          gameId: game?.gameId,
        });
      }
    }

    const linkedStealPersonId = normalizePlayerId(action.stealPersonId);
    if (linkedStealPersonId && action.actionType !== "steal") {
      const stealTeamId = opponentTeamId(teamId, homeTeamId, awayTeamId);
      const stealTeam = teamsById.get(stealTeamId);
      if (stealTeamId && stealTeam) {
        const stealAction = {
          ...action,
          teamId: stealTeamId,
          personId: linkedStealPersonId,
          playerName: action.stealPlayerName || action.stealPlayerNameI,
          playerNameI: action.stealPlayerNameI || action.stealPlayerName,
        };
        const stealer = getPlayerStats(playerStats, linkedStealPersonId, playerLookup, stealAction);
        stealer.teamId = stealer.teamId || stealTeamId;
        stealer.steals += 1;
        addPlayerStatAlert({
          alerts,
          seen,
          player: stealer,
          action,
          teamId: stealTeamId,
          category: "Defense",
          statName: "Stl",
          value: stealer.steals,
          minimum: 3,
          idPrefix: "player-steals",
          gameId: game?.gameId,
          verb: "has tallied",
          step: 2,
        });
        addPlayerAchievementAlerts({
          alerts,
          seen,
          player: stealer,
          action,
          teamId: stealTeamId,
          playerAchievementState,
          gameId: game?.gameId,
        });
      }
    }

    const personId = normalizePlayerId(action.personId);
    if (!personId || !teamId || !team) return;
    const player = getPlayerStats(playerStats, personId, playerLookup, action);
    player.teamId = player.teamId || teamId;
    const playerPeriod = getPlayerPeriodStats(player, period);
    const periodStats = getTeamPeriodStats(teamPeriodStats, teamId, period);

    if (action.actionType === "rebound") {
      player.rebounds += 1;
      playerPeriod.rebounds += 1;
      addPlayerStatAlert({
        alerts,
        seen,
        player,
        action,
        teamId,
        category: "Rebounding",
        statName: "Reb",
        value: player.rebounds,
        minimum: 14,
        idPrefix: "player-rebounds",
        gameId: game?.gameId,
        verb: "has pulled down",
        step: 2,
      });
      if (isSteppedMilestone(playerPeriod.rebounds, 5, 3)) {
        const reboundPeriodText = periodElapsedSeconds(action, game?.gameId) <= 3 * 60
          ? `to start ${periodShortLabel(period)}`
          : `in ${periodShortLabel(period)}`;
        addAlert(alerts, seen, {
          id: `player-period-rebounds:${player.personId}:${period}:${playerPeriod.rebounds}`,
          category: "Rebounding",
          period,
          clock: action.clock,
          elapsed: actionElapsedSeconds(action, game?.gameId),
          teamId,
          title: `${player.name} has gathered ${formatStat(playerPeriod.rebounds, "Reb")} ${reboundPeriodText}`,
        });
      }
      addPlayerAchievementAlerts({
        alerts,
        seen,
        player,
        action,
        teamId,
        playerAchievementState,
        gameId: game?.gameId,
      });
    }

    if (action.actionType === "block") {
      player.blocks += 1;
      periodStats.blocks += 1;
      addPlayerStatAlert({
        alerts,
        seen,
        player,
        action,
        teamId,
        category: "Defense",
        statName: "Blk",
        value: player.blocks,
        minimum: 3,
        idPrefix: "player-blocks",
        gameId: game?.gameId,
        step: 2,
      });
      addTeamPeriodBlockAlert({
        alerts,
        seen,
        team,
        teamId,
        period,
        action,
        blocks: periodStats.blocks,
        gameId: game?.gameId,
      });
      addPlayerAchievementAlerts({
        alerts,
        seen,
        player,
        action,
        teamId,
        playerAchievementState,
        gameId: game?.gameId,
      });
    }

    if (action.actionType === "steal") {
      player.steals += 1;
      addPlayerStatAlert({
        alerts,
        seen,
        player,
        action,
        teamId,
        category: "Defense",
        statName: "Stl",
        value: player.steals,
        minimum: 3,
        idPrefix: "player-steals",
        gameId: game?.gameId,
        verb: "has tallied",
        step: 2,
      });
      addPlayerAchievementAlerts({
        alerts,
        seen,
        player,
        action,
        teamId,
        playerAchievementState,
        gameId: game?.gameId,
      });
    }

    if (action.actionType === "foul") {
      const subType = String(action.subType || "").toLowerCase();
      if (!subType.includes("technical")) {
        player.fouls += 1;
        addPlayerStatAlert({
          alerts,
          seen,
          player,
          action,
          teamId,
          category: "Foul Trouble",
          statName: "PF",
          value: player.fouls,
          minimum: 4,
          idPrefix: "player-fouls",
          gameId: game?.gameId,
          verb: "has committed",
        });
      }
    }
  });

  const finalPeriod = Math.max(...orderedActions.map((action) => safeNumber(action?.period, 0)), 0);
  if (finalPeriod && !cumulativeSnapshotsByPeriod.has(finalPeriod)) {
    cumulativeSnapshotsByPeriod.set(finalPeriod, clonePlayerStats(playerStats));
    cloneTeamCumulativeStats(teamCumulativeStats, finalPeriod).forEach((stats, key) => {
      teamCumulativeStatsByPeriod.set(key, stats);
    });
  }

  addRunAlerts({ alerts, seen, scoringEvents, teamsById });
  addPeriodEndAlerts({
    alerts,
    seen,
    game,
    awayTeam,
    homeTeam,
    scoringEvents,
    cumulativeSnapshotsByPeriod,
    teamCumulativeStatsByPeriod,
    teamPeriodStats,
    teamsById,
  });

  const sortedAlerts = alerts.sort((a, b) => {
      const elapsedDelta = a.elapsed - b.elapsed;
      if (elapsedDelta !== 0) return elapsedDelta;
      const periodDelta = safeNumber(a.period, 0) - safeNumber(b.period, 0);
      if (periodDelta !== 0) return periodDelta;
      const clockDelta = parseClockSeconds(b.clock) - parseClockSeconds(a.clock);
      if (clockDelta !== 0) return clockDelta;
      return String(a.id).localeCompare(String(b.id));
    });

  return limitAlertsByPriority(sortedAlerts, maxAlerts)
    .map((alert, index) => ({
      ...alert,
      sortIndex: index,
      teamCode: teamCode(teamsById.get(alert.teamId)),
    }));
}
