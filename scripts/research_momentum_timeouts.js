const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";

const START_DATE = "2024-10-01";
const END_DATE = "2026-04-20";
const WINDOW_SECONDS = 120;
const CONCURRENCY = 8;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function* eachDate(startDate, endDate) {
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    yield formatDate(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchJsonWithRetries(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
  throw lastError;
}

function parseIsoClock(clock) {
  if (!clock) return 0;
  const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(String(clock));
  if (!match) return 0;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

function periodLengthSeconds(period) {
  return Number(period) > 4 ? 5 * 60 : 12 * 60;
}

function elapsedGameSeconds(action) {
  const period = Number(action?.period || 0);
  if (period <= 0) return 0;
  let elapsed = 0;
  for (let p = 1; p < period; p += 1) elapsed += periodLengthSeconds(p);
  return elapsed + Math.max(0, periodLengthSeconds(period) - parseIsoClock(action?.clock));
}

function numericScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function scoreByTeam(action, homeTeamId, awayTeamId) {
  const homeScore = numericScore(action?.scoreHome);
  const awayScore = numericScore(action?.scoreAway);
  return {
    [homeTeamId]: homeScore,
    [awayTeamId]: awayScore,
  };
}

function actionPointsDelta(current, previous, teamId, homeTeamId, awayTeamId) {
  const currentScores = scoreByTeam(current, homeTeamId, awayTeamId);
  const previousScores = previous
    ? scoreByTeam(previous, homeTeamId, awayTeamId)
    : { [homeTeamId]: 0, [awayTeamId]: 0 };
  return currentScores[teamId] - previousScores[teamId];
}

function isNbaGame(game) {
  const homeId = Number(game?.homeTeam?.teamId || 0);
  const awayId = Number(game?.awayTeam?.teamId || 0);
  return homeId > 0 && awayId > 0 && homeId < 1611661300 && awayId < 1611661300;
}

function isTrackedSeasonType(game) {
  return game?.seasonType === "Regular Season" || game?.seasonType === "Playoffs";
}

function isScoreChange(action, previousAction, homeTeamId, awayTeamId) {
  const homeDelta = actionPointsDelta(action, previousAction, homeTeamId, homeTeamId, awayTeamId);
  const awayDelta = actionPointsDelta(action, previousAction, awayTeamId, homeTeamId, awayTeamId);
  return homeDelta !== 0 || awayDelta !== 0;
}

function normalizeActions(actions) {
  return [...(actions || [])].sort((a, b) => {
    const aOrder = Number(a?.orderNumber ?? a?.actionNumber ?? 0);
    const bOrder = Number(b?.orderNumber ?? b?.actionNumber ?? 0);
    return aOrder - bOrder;
  });
}

function buildScoringTimeline(actions, homeTeamId, awayTeamId) {
  const timeline = [];
  let previousAction = null;
  for (const action of actions) {
    if (isScoreChange(action, previousAction, homeTeamId, awayTeamId)) {
      timeline.push({
        action,
        elapsed: elapsedGameSeconds(action),
        scores: scoreByTeam(action, homeTeamId, awayTeamId),
      });
    }
    previousAction = action;
  }
  return timeline;
}

function findPreviousScoringAction(scoringTimeline, elapsed) {
  let last = null;
  for (const entry of scoringTimeline) {
    if (entry.elapsed > elapsed) break;
    last = entry;
  }
  return last;
}

function findFirstActionAfter(actions, timeoutIndex, timeoutElapsed) {
  for (let i = timeoutIndex + 1; i < actions.length; i += 1) {
    const action = actions[i];
    if (elapsedGameSeconds(action) < timeoutElapsed) continue;
    if (String(action?.actionType || "").toLowerCase() === "timeout") continue;
    return action;
  }
  return null;
}

function findScoreAtOrBeforeElapsed(scoringTimeline, elapsed, fallbackScores) {
  let scores = fallbackScores;
  for (const entry of scoringTimeline) {
    if (entry.elapsed > elapsed) break;
    scores = entry.scores;
  }
  return scores;
}

function findOpponentRun(scoringTimeline, timeoutElapsed, teamId, opponentId) {
  let timeoutEntryIndex = -1;
  for (let i = scoringTimeline.length - 1; i >= 0; i -= 1) {
    if (scoringTimeline[i].elapsed <= timeoutElapsed) {
      timeoutEntryIndex = i;
      break;
    }
  }
  if (timeoutEntryIndex < 0) return { opponentRun: 0, teamRun: 0 };

  const currentScores = scoringTimeline[timeoutEntryIndex].scores;
  let baseScores = { ...currentScores };
  for (let i = timeoutEntryIndex; i >= 0; i -= 1) {
    const entry = scoringTimeline[i];
    const previousScores = i > 0
      ? scoringTimeline[i - 1].scores
      : { [teamId]: 0, [opponentId]: 0 };
    const teamDelta = entry.scores[teamId] - previousScores[teamId];
    if (teamDelta > 0) {
      baseScores = entry.scores;
      break;
    }
    baseScores = previousScores;
  }

  return {
    opponentRun: currentScores[opponentId] - baseScores[opponentId],
    teamRun: currentScores[teamId] - baseScores[teamId],
  };
}

function collectWindowScoring(scoringTimeline, startElapsed, endElapsed, teamId, opponentId) {
  const beforeScores = findScoreAtOrBeforeElapsed(scoringTimeline, startElapsed, {
    [teamId]: 0,
    [opponentId]: 0,
  });
  const afterScores = findScoreAtOrBeforeElapsed(scoringTimeline, endElapsed, beforeScores);
  return {
    teamPoints: afterScores[teamId] - beforeScores[teamId],
    opponentPoints: afterScores[opponentId] - beforeScores[opponentId],
  };
}

function summarizeCases(cases) {
  const total = cases.length;
  const totalMargin = cases.reduce((sum, item) => sum + item.postMargin, 0);
  const sortedMargins = cases.map((item) => item.postMargin).sort((a, b) => a - b);
  const median = total
    ? (sortedMargins[Math.floor((total - 1) / 2)] + sortedMargins[Math.ceil((total - 1) / 2)]) / 2
    : 0;
  const won = cases.filter((item) => item.postMargin > 0).length;
  const evenOrBetter = cases.filter((item) => item.postMargin >= 0).length;
  const opponentExtended = cases.filter((item) => item.postMargin < 0).length;
  return {
    total,
    averageMargin: total ? totalMargin / total : 0,
    medianMargin: median,
    wonPct: total ? (won / total) * 100 : 0,
    evenOrBetterPct: total ? (evenOrBetter / total) * 100 : 0,
    opponentExtendedPct: total ? (opponentExtended / total) * 100 : 0,
    averageTeamPoints: total ? cases.reduce((sum, item) => sum + item.postTeamPoints, 0) / total : 0,
    averageOpponentPoints: total ? cases.reduce((sum, item) => sum + item.postOpponentPoints, 0) / total : 0,
  };
}

function formatSummary(label, summary) {
  return [
    `${label}`,
    `  qualifying timeouts: ${summary.total}`,
    `  avg post-timeout margin (next 2:00): ${summary.averageMargin.toFixed(2)}`,
    `  median post-timeout margin: ${summary.medianMargin.toFixed(2)}`,
    `  avg scoring next 2:00: ${summary.averageTeamPoints.toFixed(2)}-${summary.averageOpponentPoints.toFixed(2)}`,
    `  timeout team won next 2:00: ${summary.wonPct.toFixed(1)}%`,
    `  timeout team broke even or better: ${summary.evenOrBetterPct.toFixed(1)}%`,
    `  opponent kept extending margin: ${summary.opponentExtendedPct.toFixed(1)}%`,
  ].join("\n");
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;
  async function runner() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

async function fetchGamesForDates(dates) {
  const gameLists = await mapWithConcurrency(dates, CONCURRENCY, async (date) => {
    try {
      const games = await fetchJsonWithRetries(`${API_BASE}/games/byDate?date=${date}`);
      return (games || []).filter((game) => isNbaGame(game) && isTrackedSeasonType(game));
    } catch {
      return [];
    }
  });
  const byId = new Map();
  for (const games of gameLists) {
    for (const game of games) byId.set(String(game.gameId), game);
  }
  return [...byId.values()];
}

function analyzeGame(game) {
  const homeTeamId = Number(game?.homeTeam?.teamId || 0);
  const awayTeamId = Number(game?.awayTeam?.teamId || 0);
  const actions = normalizeActions(game?.playByPlayActions);
  const scoringTimeline = buildScoringTimeline(actions, homeTeamId, awayTeamId);
  const cases = [];

  actions.forEach((action, index) => {
    if (String(action?.actionType || "").toLowerCase() !== "timeout") return;
    const qualifiers = (action?.qualifiers || []).map((item) => String(item || "").toLowerCase());
    if (!qualifiers.includes("team")) return;
    if (qualifiers.includes("mandatory")) return;
    if (String(action?.description || "").toLowerCase().includes("challenge")) return;

    const timeoutTeamId = Number(action.teamId || 0);
    if (timeoutTeamId !== homeTeamId && timeoutTeamId !== awayTeamId) return;
    if (Number(action.period || 0) > 4) return;

    const timeoutElapsed = elapsedGameSeconds(action);
    const resumeAction = findFirstActionAfter(actions, index, timeoutElapsed);
    if (!resumeAction) return;
    const resumeElapsed = elapsedGameSeconds(resumeAction);
    const finalElapsed = actions.length ? elapsedGameSeconds(actions[actions.length - 1]) : 0;
    if (finalElapsed - resumeElapsed < WINDOW_SECONDS) return;

    const timeoutScores = scoreByTeam(action, homeTeamId, awayTeamId);
    const opponentId = timeoutTeamId === homeTeamId ? awayTeamId : homeTeamId;
    const currentMargin = timeoutScores[timeoutTeamId] - timeoutScores[opponentId];
    const period = Number(action.period || 0);
    const remainingAtTimeout = parseIsoClock(action.clock);
    if (period === 4 && remainingAtTimeout <= WINDOW_SECONDS) return;

    const run = findOpponentRun(scoringTimeline, timeoutElapsed, timeoutTeamId, opponentId);
    const windowStart = Math.max(0, resumeElapsed - WINDOW_SECONDS);
    const preWindowScores = findScoreAtOrBeforeElapsed(scoringTimeline, windowStart, {
      [timeoutTeamId]: 0,
      [opponentId]: 0,
    });
    const preMargin = (timeoutScores[timeoutTeamId] - preWindowScores[timeoutTeamId]) -
      (timeoutScores[opponentId] - preWindowScores[opponentId]);
    const postScoring = collectWindowScoring(
      scoringTimeline,
      resumeElapsed,
      resumeElapsed + WINDOW_SECONDS,
      timeoutTeamId,
      opponentId
    );
    const postMargin = postScoring.teamPoints - postScoring.opponentPoints;

    cases.push({
      gameId: game.gameId,
      seasonYear: game.seasonYear,
      seasonType: game.seasonType,
      period,
      clock: action.clock,
      timeoutTeamId,
      timeoutTeam: timeoutTeamId === homeTeamId ? game.homeTeam.teamTricode : game.awayTeam.teamTricode,
      opponentTeam: opponentId === homeTeamId ? game.homeTeam.teamTricode : game.awayTeam.teamTricode,
      currentMargin,
      strictRunOpponent: run.opponentRun,
      strictRunTeam: run.teamRun,
      previousWindowMargin: preMargin,
      postTeamPoints: postScoring.teamPoints,
      postOpponentPoints: postScoring.opponentPoints,
      postMargin,
      description: action.description,
    });
  });

  return cases;
}

function topExamples(cases, predicate, limit = 10) {
  return cases
    .filter(predicate)
    .sort((a, b) => b.postMargin - a.postMargin)
    .slice(0, limit);
}

async function main() {
  const dates = [...eachDate(START_DATE, END_DATE)];
  console.error(`Fetching schedules for ${dates.length} dates...`);
  const scheduledGames = await fetchGamesForDates(dates);
  console.error(`Found ${scheduledGames.length} NBA regular-season/playoff games.`);

  const failedGames = [];
  const detailedGames = await mapWithConcurrency(scheduledGames, CONCURRENCY, async (game, index) => {
    if (index % 100 === 0) {
      console.error(`Fetching game ${index + 1}/${scheduledGames.length}...`);
    }
    try {
      return await fetchJsonWithRetries(`${API_BASE}/games/${game.gameId}`);
    } catch (error) {
      failedGames.push({
        gameId: game.gameId,
        seasonYear: game.seasonYear,
        seasonType: game.seasonType,
        error: String(error?.message || error),
      });
      return null;
    }
  });

  const successfulGames = detailedGames.filter(Boolean);
  const allCases = successfulGames.flatMap(analyzeGame);
  const strictCases = allCases.filter((item) => item.strictRunOpponent >= 6 && item.strictRunTeam === 0);
  const windowCases = allCases.filter((item) => item.previousWindowMargin <= -6);

  const output = {
    searchedSeasons: [...new Set(scheduledGames.map((game) => game.seasonYear))].sort(),
    scheduledGames: scheduledGames.length,
    fetchedGames: successfulGames.length,
    failedGames,
    timeoutEvents: allCases.length,
    strictRunDefinition: {
      label: "Opponent on live 6-0+ run at timeout",
      summary: summarizeCases(strictCases),
      examples: topExamples(strictCases, () => true, 8),
    },
    windowDefinition: {
      label: "Opponent outscored timeout team by 6+ in prior 2:00",
      summary: summarizeCases(windowCases),
      examples: topExamples(windowCases, () => true, 8),
    },
  };

  console.log(JSON.stringify(output, null, 2));
  console.error(formatSummary(output.strictRunDefinition.label, output.strictRunDefinition.summary));
  console.error("");
  console.error(formatSummary(output.windowDefinition.label, output.windowDefinition.summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
