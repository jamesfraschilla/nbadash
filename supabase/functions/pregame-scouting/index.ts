const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL =
  Deno.env.get("OPENAI_SCOUTING_MODEL") ||
  Deno.env.get("OPENAI_ANALYSIS_MODEL") ||
  "gpt-4.1-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function requestJson(url: string) {
  return fetch(url, { headers: { Accept: "application/json" } }).then((response) => {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json();
  });
}

function parseIsoDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = safeNumber(match[1], 0);
  const month = safeNumber(match[2], 0);
  const day = safeNumber(match[3], 0);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateKeyToUtcMs(dateKey: string) {
  const parsed = parseIsoDateKey(dateKey);
  if (!parsed) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const utcMs = dateKeyToUtcMs(dateKey);
  if (utcMs == null) return dateKey;
  const next = new Date(utcMs + (deltaDays * 24 * 60 * 60 * 1000));
  return formatDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

function compareDateKeys(left: string, right: string) {
  return String(left || "").localeCompare(String(right || ""));
}

function todayDateKey() {
  const now = new Date();
  return formatDateKey({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });
}

function normalizeClock(clock: unknown) {
  const value = String(clock || "").trim();
  if (!value) return "";
  if (!value.startsWith("PT")) return value;
  const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(value);
  if (!match) return "";
  const minutes = safeNumber(match[1], 0);
  const seconds = Math.floor(safeNumber(match[2], 0));
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseClockToSeconds(clock: unknown) {
  const normalized = normalizeClock(clock);
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) return 0;
  return (safeNumber(match[1], 0) * 60) + safeNumber(match[2], 0);
}

function parseIsoMinutesToSeconds(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+:\d+$/.test(text)) return parseClockToSeconds(text);
  const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(text);
  if (!match) return 0;
  return (safeNumber(match[1], 0) * 60) + Math.round(safeNumber(match[2], 0));
}

function formatSecondsClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playerLabel(player: Record<string, unknown>) {
  const explicit = String(player?.nameI || player?.fullName || player?.playerName || "").trim();
  if (explicit) return explicit;
  const firstName = String(player?.firstName || "").trim();
  const familyName = String(player?.familyName || "").trim();
  const combined = `${firstName} ${familyName}`.trim();
  return combined || "Unknown";
}

function estimatePossessions(teamTotals: Record<string, unknown>, opponentTotals: Record<string, unknown>) {
  const fieldGoalsAttempted = safeNumber(teamTotals.fieldGoalsAttempted, 0);
  const freeThrowsAttempted = safeNumber(teamTotals.freeThrowsAttempted, 0);
  const offensiveRebounds = safeNumber(teamTotals.reboundsOffensive, 0);
  const turnovers = safeNumber(teamTotals.turnovers, 0);
  const opponentFieldGoalsAttempted = safeNumber(opponentTotals.fieldGoalsAttempted, 0);
  const opponentFreeThrowsAttempted = safeNumber(opponentTotals.freeThrowsAttempted, 0);
  const opponentOffensiveRebounds = safeNumber(opponentTotals.reboundsOffensive, 0);
  const opponentTurnovers = safeNumber(opponentTotals.turnovers, 0);

  return 0.5 * (
    (fieldGoalsAttempted + 0.44 * freeThrowsAttempted - offensiveRebounds + turnovers) +
    (opponentFieldGoalsAttempted + 0.44 * opponentFreeThrowsAttempted - opponentOffensiveRebounds + opponentTurnovers)
  );
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function meanLabel(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundThreshold(value: number, step: number, mode: "up" | "down" = "up") {
  if (!Number.isFinite(value)) return 0;
  if (mode === "down") return Math.floor(value / step) * step;
  return Math.ceil(value / step) * step;
}

function formatRecord(wins: number, losses: number) {
  return `${wins}-${losses}`;
}

function splitAverage(values: number[]) {
  return values.length ? meanLabel(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : 0;
}

function gameSortValue(game: Record<string, unknown>) {
  const rawUtc = String(game?.gameTimeUTC || "").trim();
  if (rawUtc) {
    const parsed = Date.parse(rawUtc);
    if (Number.isFinite(parsed)) return parsed;
  }
  const rawDate = String(game?.gameDate || "").trim();
  const parsedDate = rawDate ? dateKeyToUtcMs(rawDate) : null;
  return parsedDate ?? 0;
}

function extractGameDateKey(game: Record<string, unknown>, fallbackDate = "") {
  const rawUtc = String(game?.gameTimeUTC || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(rawUtc)) return rawUtc.slice(0, 10);
  const rawDate = String(game?.gameDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  return fallbackDate;
}

function isCompletedGame(game: Record<string, unknown>) {
  return safeNumber(game?.gameStatus, 0) === 3;
}

function involvesTeam(game: Record<string, unknown>, teamId: string) {
  return String(game?.homeTeam?.teamId || "") === teamId || String(game?.awayTeam?.teamId || "") === teamId;
}

function selectTeamPerspective(game: Record<string, unknown>, teamId: string) {
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  if (teamId === homeTeamId) {
    return {
      side: "home",
      team: (game.homeTeam || {}) as Record<string, unknown>,
      opponent: (game.awayTeam || {}) as Record<string, unknown>,
      teamStats: ((game.teamStats || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
      opponentStats: ((game.teamStats || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
      teamBox: ((game.boxScore || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
      opponentBox: ((game.boxScore || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    };
  }
  return {
    side: "away",
    team: (game.awayTeam || {}) as Record<string, unknown>,
    opponent: (game.homeTeam || {}) as Record<string, unknown>,
    teamStats: ((game.teamStats || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    opponentStats: ((game.teamStats || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
    teamBox: ((game.boxScore || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    opponentBox: ((game.boxScore || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
  };
}

async function fetchGamesByDate(dateKey: string) {
  const games = await requestJson(`${API_BASE}/games/byDate?date=${dateKey}`).catch(() => []);
  return Array.isArray(games) ? games as Record<string, unknown>[] : [];
}

async function collectPreviousGames(teamId: string, gameCount: number) {
  const seen = new Map<string, Record<string, unknown>>();
  const today = todayDateKey();

  for (let offset = 0; offset < 240 && seen.size < gameCount; offset += 1) {
    const dateKey = shiftDateKey(today, -offset);
    const games = await fetchGamesByDate(dateKey);
    games
      .filter((game) => isCompletedGame(game) && involvesTeam(game, teamId))
      .forEach((game) => {
        const gameId = String(game?.gameId || "").trim();
        if (!gameId || seen.has(gameId)) return;
        seen.set(gameId, {
          ...game,
          gameDate: extractGameDateKey(game, dateKey),
        });
      });
  }

  return [...seen.values()]
    .sort((left, right) => gameSortValue(right) - gameSortValue(left))
    .slice(0, gameCount)
    .sort((left, right) => gameSortValue(left) - gameSortValue(right));
}

async function collectGamesByDateRange(teamId: string, startDate: string, endDate: string) {
  const safeStart = compareDateKeys(startDate, endDate) <= 0 ? startDate : endDate;
  const safeEnd = compareDateKeys(startDate, endDate) <= 0 ? endDate : startDate;
  const seen = new Map<string, Record<string, unknown>>();

  for (let cursor = safeStart; compareDateKeys(cursor, safeEnd) <= 0; cursor = shiftDateKey(cursor, 1)) {
    const games = await fetchGamesByDate(cursor);
    games
      .filter((game) => isCompletedGame(game) && involvesTeam(game, teamId))
      .forEach((game) => {
        const gameId = String(game?.gameId || "").trim();
        if (!gameId || seen.has(gameId)) return;
        seen.set(gameId, {
          ...game,
          gameDate: extractGameDateKey(game, cursor),
        });
      });
  }

  return [...seen.values()].sort((left, right) => gameSortValue(left) - gameSortValue(right));
}

async function fetchGameBundle(gameCard: Record<string, unknown>) {
  const gameId = String(gameCard?.gameId || "").trim();
  const [game, minutesData] = await Promise.all([
    requestJson(`${API_BASE}/games/${gameId}`),
    requestJson(`${API_BASE}/games/${gameId}/minutes`).catch(() => null),
  ]);

  return {
    gameId,
    game,
    minutesData,
    gameDate: extractGameDateKey(gameCard, ""),
  };
}

function buildGameSnapshot(bundle: {
  gameId: string;
  game: Record<string, unknown>;
  gameDate: string;
}, teamId: string) {
  const perspective = selectTeamPerspective(bundle.game, teamId);
  const teamTotals = (perspective.teamBox?.totals || {}) as Record<string, unknown>;
  const opponentTotals = (perspective.opponentBox?.totals || {}) as Record<string, unknown>;
  const teamScore = safeNumber(perspective.team?.score, safeNumber(teamTotals.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber(opponentTotals.points, 0));
  const margin = teamScore - opponentScore;
  const teamTransitionStats = (perspective.teamStats?.transitionStats || {}) as Record<string, unknown>;
  const opponentTransitionStats = (perspective.opponentStats?.transitionStats || {}) as Record<string, unknown>;
  const teamPlayers = Array.isArray(perspective.teamBox?.players) ? perspective.teamBox.players as Record<string, unknown>[] : [];
  const topScorer = [...teamPlayers]
    .sort((left, right) => safeNumber(right.points, 0) - safeNumber(left.points, 0))
    .find((player) => safeNumber(player.points, 0) > 0) || null;
  const playerStats = teamPlayers.map((player) => ({
    name: playerLabel(player),
    points: safeNumber(player.points, 0),
    assists: safeNumber(player.assists, 0),
    rebounds: safeNumber(player.reboundsTotal, 0),
    turnovers: safeNumber(player.turnovers, 0),
    freeThrowsAttempted: safeNumber(player.freeThrowsAttempted, 0),
    threePointersAttempted: safeNumber(player.threePointersAttempted, 0),
  }));

  return {
    gameId: bundle.gameId,
    date: bundle.gameDate,
    opponent: {
      teamId: String(perspective.opponent?.teamId || ""),
      tricode: String(perspective.opponent?.teamTricode || perspective.opponent?.teamName || "").trim(),
      name: String(perspective.opponent?.teamName || perspective.opponent?.teamTricode || "Opponent").trim(),
    },
    result: margin >= 0 ? "W" : "L",
    score: `${teamScore}-${opponentScore}`,
    margin,
    offensiveRating: meanLabel(safeNumber(perspective.teamStats?.offensiveRating, 0), 1),
    defensiveRating: meanLabel(safeNumber(perspective.teamStats?.defensiveRating, 0), 1),
    possessions: meanLabel(
      safeNumber(
        perspective.teamStats?.possessions,
        estimatePossessions(teamTotals, opponentTotals),
      ),
      1,
    ),
    metrics: {
      turnovers: safeNumber(teamTotals.turnovers, 0),
      threePointersAttempted: safeNumber(teamTotals.threePointersAttempted, 0),
      freeThrowsAttempted: safeNumber(teamTotals.freeThrowsAttempted, 0),
      paintPoints: safeNumber(teamTransitionStats.paintPoints, safeNumber(teamTotals.rimFieldGoalsMade, 0) * 2),
      pointsOffTurnovers: safeNumber(teamTransitionStats.pointsOffTurnovers, 0),
      secondChancePoints: safeNumber(teamTransitionStats.secondChancePoints, 0),
      transitionPoints: safeNumber(teamTransitionStats.transitionPoints, 0),
      opponentPaintPoints: safeNumber(opponentTransitionStats.paintPoints, safeNumber(opponentTotals.rimFieldGoalsMade, 0) * 2),
      opponentTransitionPoints: safeNumber(opponentTransitionStats.transitionPoints, 0),
      opponentSecondChancePoints: safeNumber(opponentTransitionStats.secondChancePoints, 0),
    },
    playerStats,
    topScorer: topScorer
      ? {
        name: playerLabel(topScorer),
        points: safeNumber(topScorer.points, 0),
      }
      : null,
  };
}

function addPlayerAggregation(
  store: Map<string, Record<string, unknown>>,
  players: Record<string, unknown>[],
) {
  players.forEach((player) => {
    const personId = String(player?.personId || "").trim();
    const name = playerLabel(player);
    if (!personId && !name) return;
    const key = personId || name;
    const existing = store.get(key) || {
      personId,
      name,
      games: 0,
      minutes: 0,
      points: 0,
      assists: 0,
      rebounds: 0,
      threesMade: 0,
      threesAttempted: 0,
      turnovers: 0,
    };

    existing.games = safeNumber(existing.games, 0) + 1;
    existing.minutes = safeNumber(existing.minutes, 0) + parseIsoMinutesToSeconds(player?.minutes);
    existing.points = safeNumber(existing.points, 0) + safeNumber(player?.points, 0);
    existing.assists = safeNumber(existing.assists, 0) + safeNumber(player?.assists, 0);
    existing.rebounds = safeNumber(existing.rebounds, 0) + safeNumber(player?.reboundsTotal, 0);
    existing.threesMade = safeNumber(existing.threesMade, 0) + safeNumber(player?.threePointersMade, 0);
    existing.threesAttempted = safeNumber(existing.threesAttempted, 0) + safeNumber(player?.threePointersAttempted, 0);
    existing.turnovers = safeNumber(existing.turnovers, 0) + safeNumber(player?.turnovers, 0);
    store.set(key, existing);
  });
}

function addLineupAggregation(
  store: Map<string, {
    label: string;
    seconds: number;
    plusMinus: number;
    games: Set<string>;
  }>,
  bundle: {
    gameId: string;
    game: Record<string, unknown>;
    minutesData: Record<string, unknown> | null;
  },
  teamId: string,
) {
  const perspective = selectTeamPerspective(bundle.game, teamId);
  const periods = Array.isArray(bundle.minutesData?.periods) ? bundle.minutesData?.periods as Record<string, unknown>[] : [];
  periods.forEach((period) => {
    const stints = Array.isArray(period?.stints) ? period.stints as Record<string, unknown>[] : [];
    stints.forEach((stint) => {
      const lineup = perspective.side === "home"
        ? (Array.isArray(stint.playersHome) ? stint.playersHome as Record<string, unknown>[] : [])
        : (Array.isArray(stint.playersAway) ? stint.playersAway as Record<string, unknown>[] : []);
      if (!lineup.length) return;
      const label = lineup
        .map((player) => String(player?.nameI || player?.fullName || player?.playerName || "").trim())
        .filter(Boolean)
        .join(", ");
      if (!label) return;
      const durationSeconds = Math.max(
        0,
        parseClockToSeconds(stint.startClock) - parseClockToSeconds(stint.endClock),
      );
      const plusMinus = perspective.side === "home"
        ? safeNumber(stint.plusMinus, 0)
        : -safeNumber(stint.plusMinus, 0);
      const existing = store.get(label) || {
        label,
        seconds: 0,
        plusMinus: 0,
        games: new Set<string>(),
      };
      existing.seconds += durationSeconds;
      existing.plusMinus += plusMinus;
      existing.games.add(bundle.gameId);
      store.set(label, existing);
    });
  });
}

function buildRangeLabel(mode: string, gameCount: number, startDate: string, endDate: string) {
  if (mode === "dates") return `${startDate} to ${endDate}`;
  return `Previous ${gameCount} Game${gameCount === 1 ? "" : "s"}`;
}

function buildSplitOutlierNotes(
  teamTricode: string,
  gameSnapshots: Array<Record<string, unknown>>,
) {
  const wins = gameSnapshots.filter((game) => String(game.result || "") === "W");
  const losses = gameSnapshots.filter((game) => String(game.result || "") === "L");
  if (wins.length < 2 || losses.length < 2) return [];

  const candidateDefs = [
    { label: "offensive rating", getValue: (game: Record<string, unknown>) => safeNumber(game.offensiveRating, 0), better: "higher", decimals: 1 },
    { label: "defensive rating", getValue: (game: Record<string, unknown>) => safeNumber(game.defensiveRating, 0), better: "lower", decimals: 1 },
    { label: "turnovers", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.turnovers, 0), better: "lower", decimals: 1 },
    { label: "3-point attempts", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.threePointersAttempted, 0), better: "higher", decimals: 1 },
    { label: "free-throw attempts", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.freeThrowsAttempted, 0), better: "higher", decimals: 1 },
    { label: "paint points", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.paintPoints, 0), better: "higher", decimals: 1 },
    { label: "second-chance points", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.secondChancePoints, 0), better: "higher", decimals: 1 },
    { label: "transition points", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.transitionPoints, 0), better: "higher", decimals: 1 },
    { label: "paint points allowed", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.opponentPaintPoints, 0), better: "lower", decimals: 1 },
    { label: "transition points allowed", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.opponentTransitionPoints, 0), better: "lower", decimals: 1 },
    { label: "second-chance points allowed", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.opponentSecondChancePoints, 0), better: "lower", decimals: 1 },
    { label: "top-scorer points", getValue: (game: Record<string, unknown>) => safeNumber((game.topScorer as Record<string, unknown>)?.points, 0), better: "higher", decimals: 1 },
  ];

  const notes = candidateDefs
    .map((candidate) => {
      const winValues = wins.map(candidate.getValue).filter((value) => Number.isFinite(value));
      const lossValues = losses.map(candidate.getValue).filter((value) => Number.isFinite(value));
      if (winValues.length < 2 || lossValues.length < 2) return null;
      const winAverage = splitAverage(winValues);
      const lossAverage = splitAverage(lossValues);
      const gap = Math.abs(winAverage - lossAverage);
      const baseline = Math.max(1, Math.min(Math.abs(winAverage), Math.abs(lossAverage)));
      const relativeGap = gap / baseline;
      const strongerInWins = candidate.better === "lower" ? winAverage < lossAverage : winAverage > lossAverage;
      if (!strongerInWins || gap < 1 || relativeGap < 0.15) return null;
      return {
        score: gap + (relativeGap * 12),
        text: `${teamTricode} averaged ${meanLabel(lossAverage, candidate.decimals)} ${candidate.label} in losses versus ${meanLabel(winAverage, candidate.decimals)} in wins.`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right!.score - left!.score);

  const seenLabels = new Set<string>();
  return notes
    .filter((entry) => {
      const labelMatch = /averaged .*? (.+?) in losses/.exec(entry!.text);
      const key = labelMatch?.[1] || entry!.text;
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    })
    .slice(0, 3)
    .map((entry) => entry!.text);
}

function buildThresholdRecordNotes(
  teamTricode: string,
  gameSnapshots: Array<Record<string, unknown>>,
  featuredPlayers: Array<{ name: string }>,
) {
  if (gameSnapshots.length < 5) return [];
  const notes: Array<{ score: number; text: string }> = [];

  const metricCandidates = [
    { label: "offensive rating", getValue: (game: Record<string, unknown>) => safeNumber(game.offensiveRating, 0), step: 5, preferredDirection: "higher" },
    { label: "defensive rating", getValue: (game: Record<string, unknown>) => safeNumber(game.defensiveRating, 0), step: 5, preferredDirection: "lower" },
    { label: "3-point attempts", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.threePointersAttempted, 0), step: 5, preferredDirection: "higher" },
    { label: "free-throw attempts", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.freeThrowsAttempted, 0), step: 2, preferredDirection: "higher" },
    { label: "paint points", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.paintPoints, 0), step: 5, preferredDirection: "higher" },
    { label: "turnovers", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.turnovers, 0), step: 2, preferredDirection: "lower" },
    { label: "transition points allowed", getValue: (game: Record<string, unknown>) => safeNumber((game.metrics as Record<string, unknown>)?.opponentTransitionPoints, 0), step: 2, preferredDirection: "lower" },
  ];

  metricCandidates.forEach((candidate) => {
    const values = gameSnapshots.map(candidate.getValue).filter((value) => Number.isFinite(value));
    if (values.length < 5 || new Set(values).size < 3) return;
    const medianValue = median(values);
    const thresholds = candidate.preferredDirection === "higher"
      ? [
        { comparator: "atLeast", threshold: roundThreshold(medianValue, candidate.step, "up") },
        { comparator: "atMost", threshold: roundThreshold(medianValue, candidate.step, "down") },
      ]
      : [
        { comparator: "atMost", threshold: roundThreshold(medianValue, candidate.step, "down") },
        { comparator: "atLeast", threshold: roundThreshold(medianValue, candidate.step, "up") },
      ];

    thresholds.forEach((rule) => {
      const matches = gameSnapshots.filter((game) => {
        const value = candidate.getValue(game);
        return rule.comparator === "atLeast" ? value >= rule.threshold : value <= rule.threshold;
      });
      const others = gameSnapshots.filter((game) => !matches.includes(game));
      if (matches.length < 2 || others.length < 2) return;
      const matchWins = matches.filter((game) => String(game.result || "") === "W").length;
      const otherWins = others.filter((game) => String(game.result || "") === "W").length;
      const matchWinPct = matchWins / matches.length;
      const otherWinPct = otherWins / others.length;
      const edge = matchWinPct - otherWinPct;
      if (edge < 0.4 || matchWinPct < 0.7) return;
      const phrasing = rule.comparator === "atLeast"
        ? `${candidate.label} reaches ${rule.threshold}+`
        : `${candidate.label} stays at ${rule.threshold} or lower`;
      notes.push({
        score: (edge * 10) + matches.length,
        text: `${teamTricode} is ${formatRecord(matchWins, matches.length - matchWins)} when ${phrasing}.`,
      });
    });
  });

  featuredPlayers.slice(0, 3).forEach((player) => {
    const playerMetricCandidates = [
      { label: "points", statKey: "points", step: 5, preferredDirection: "higher" },
      { label: "assists", statKey: "assists", step: 2, preferredDirection: "higher" },
      { label: "rebounds", statKey: "rebounds", step: 2, preferredDirection: "higher" },
      { label: "free throws", statKey: "freeThrowsAttempted", step: 2, preferredDirection: "higher" },
      { label: "turnovers", statKey: "turnovers", step: 1, preferredDirection: "lower" },
      { label: "3-point attempts", statKey: "threePointersAttempted", step: 2, preferredDirection: "higher" },
    ];

    playerMetricCandidates.forEach((candidate) => {
      const values = gameSnapshots.map((game) => {
        const playerRow = Array.isArray(game.playerStats)
          ? (game.playerStats as Record<string, unknown>[]).find((entry) => String(entry.name || "").trim() === player.name)
          : null;
        return safeNumber(playerRow?.[candidate.statKey], 0);
      });
      if (values.length < 5 || new Set(values).size < 3) return;
      const medianValue = median(values);
      const thresholds = candidate.preferredDirection === "higher"
        ? [
          { comparator: "atLeast", threshold: roundThreshold(medianValue, candidate.step, "up") },
          { comparator: "atMost", threshold: roundThreshold(medianValue, candidate.step, "down") },
        ]
        : [
          { comparator: "atMost", threshold: roundThreshold(medianValue, candidate.step, "down") },
          { comparator: "atLeast", threshold: roundThreshold(medianValue, candidate.step, "up") },
        ];

      thresholds.forEach((rule) => {
        const matches = gameSnapshots.filter((game) => {
          const playerRow = Array.isArray(game.playerStats)
            ? (game.playerStats as Record<string, unknown>[]).find((entry) => String(entry.name || "").trim() === player.name)
            : null;
          const value = safeNumber(playerRow?.[candidate.statKey], 0);
          return rule.comparator === "atLeast" ? value >= rule.threshold : value <= rule.threshold;
        });
        const others = gameSnapshots.filter((game) => !matches.includes(game));
        if (matches.length < 2 || others.length < 2) return;
        const matchWins = matches.filter((game) => String(game.result || "") === "W").length;
        const otherWins = others.filter((game) => String(game.result || "") === "W").length;
        const matchWinPct = matchWins / matches.length;
        const otherWinPct = otherWins / others.length;
        const edge = matchWinPct - otherWinPct;
        if (edge < 0.45 || matchWinPct < 0.7) return;
        const phrasing = rule.comparator === "atLeast"
          ? `${player.name} gets to ${rule.threshold}+ ${candidate.label}`
          : `${player.name} stays at ${rule.threshold} or fewer ${candidate.label}`;
        notes.push({
          score: (edge * 10) + matches.length,
          text: `${teamTricode} is ${formatRecord(matchWins, matches.length - matchWins)} when ${phrasing}.`,
        });
      });
    });
  });

  return notes
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.text);
}

function buildFeaturePayload(
  teamId: string,
  selection: { mode: string; gameCount: number; startDate: string; endDate: string; rangeLabel: string },
  bundles: Array<{
    gameId: string;
    game: Record<string, unknown>;
    minutesData: Record<string, unknown> | null;
    gameDate: string;
  }>,
) {
  const firstPerspective = bundles.length ? selectTeamPerspective(bundles[0].game, teamId) : null;
  const team = firstPerspective?.team || {};
  const playerMap = new Map<string, Record<string, unknown>>();
  const lineupMap = new Map<string, { label: string; seconds: number; plusMinus: number; games: Set<string> }>();

  let wins = 0;
  let losses = 0;
  let totalPointsFor = 0;
  let totalPointsAgainst = 0;
  let totalMargin = 0;
  let totalPossessions = 0;
  let totalTransitionPoints = 0;
  let totalTransitionPossessions = 0;
  let totalSecondChancePoints = 0;
  let totalPointsOffTurnovers = 0;
  let totalPaintPoints = 0;
  let totalDeflections = 0;
  let totalChargesDrawn = 0;
  let totalOpponentTransitionPoints = 0;
  let totalOpponentSecondChancePoints = 0;
  let totalOpponentPointsOffTurnovers = 0;
  let totalOpponentPaintPoints = 0;

  const summedTeamTotals = {
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    reboundsTotal: 0,
    reboundsOffensive: 0,
    turnovers: 0,
    rimFieldGoalsMade: 0,
    rimFieldGoalsAttempted: 0,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
  };
  const summedOpponentTotals = {
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    reboundsTotal: 0,
    reboundsOffensive: 0,
    turnovers: 0,
    rimFieldGoalsMade: 0,
    rimFieldGoalsAttempted: 0,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
  };

  const gameSnapshots = bundles.map((bundle) => {
    const perspective = selectTeamPerspective(bundle.game, teamId);
    const teamTotals = (perspective.teamBox?.totals || {}) as Record<string, unknown>;
    const opponentTotals = (perspective.opponentBox?.totals || {}) as Record<string, unknown>;
    const teamScore = safeNumber(perspective.team?.score, safeNumber(teamTotals.points, 0));
    const opponentScore = safeNumber(perspective.opponent?.score, safeNumber(opponentTotals.points, 0));
    const margin = teamScore - opponentScore;
    const possessions = safeNumber(perspective.teamStats?.possessions, estimatePossessions(teamTotals, opponentTotals));
    const transitionStats = (perspective.teamStats?.transitionStats || {}) as Record<string, unknown>;
    const opponentTransitionStats = (perspective.opponentStats?.transitionStats || {}) as Record<string, unknown>;
    const advancedStats = (perspective.teamStats?.advancedStats || {}) as Record<string, unknown>;
    const teamPlayers = Array.isArray(perspective.teamBox?.players) ? perspective.teamBox.players as Record<string, unknown>[] : [];

    if (margin >= 0) wins += 1;
    else losses += 1;

    totalPointsFor += teamScore;
    totalPointsAgainst += opponentScore;
    totalMargin += margin;
    totalPossessions += possessions;
    totalTransitionPoints += safeNumber(transitionStats.transitionPoints, 0);
    totalTransitionPossessions += safeNumber(transitionStats.transitionPossessions, 0);
    totalSecondChancePoints += safeNumber(transitionStats.secondChancePoints, 0);
    totalPointsOffTurnovers += safeNumber(transitionStats.pointsOffTurnovers, 0);
    totalPaintPoints += safeNumber(transitionStats.paintPoints, safeNumber(teamTotals.rimFieldGoalsMade, 0) * 2);
    totalDeflections += safeNumber(advancedStats.deflections, 0);
    totalChargesDrawn += safeNumber(advancedStats.chargesDrawn, 0);
    totalOpponentTransitionPoints += safeNumber(opponentTransitionStats.transitionPoints, 0);
    totalOpponentSecondChancePoints += safeNumber(opponentTransitionStats.secondChancePoints, 0);
    totalOpponentPointsOffTurnovers += safeNumber(opponentTransitionStats.pointsOffTurnovers, 0);
    totalOpponentPaintPoints += safeNumber(opponentTransitionStats.paintPoints, safeNumber(opponentTotals.rimFieldGoalsMade, 0) * 2);

    Object.keys(summedTeamTotals).forEach((key) => {
      summedTeamTotals[key as keyof typeof summedTeamTotals] += safeNumber(teamTotals[key], 0);
      summedOpponentTotals[key as keyof typeof summedOpponentTotals] += safeNumber(opponentTotals[key], 0);
    });

    addPlayerAggregation(playerMap, teamPlayers);
    addLineupAggregation(lineupMap, bundle, teamId);
    return buildGameSnapshot(bundle, teamId);
  });

  const gamesScanned = gameSnapshots.length;
  const opponentDefensiveRebounds = Math.max(0, summedOpponentTotals.reboundsTotal - summedOpponentTotals.reboundsOffensive);
  const teamDefensiveRebounds = Math.max(0, summedTeamTotals.reboundsTotal - summedTeamTotals.reboundsOffensive);
  const offense = {
    efg: percentage(
      summedTeamTotals.fieldGoalsMade + (0.5 * summedTeamTotals.threePointersMade),
      summedTeamTotals.fieldGoalsAttempted,
    ),
    tovRate: percentage(
      summedTeamTotals.turnovers,
      summedTeamTotals.fieldGoalsAttempted + (0.44 * summedTeamTotals.freeThrowsAttempted) + summedTeamTotals.turnovers,
    ),
    orbPct: percentage(
      summedTeamTotals.reboundsOffensive,
      summedTeamTotals.reboundsOffensive + opponentDefensiveRebounds,
    ),
    freeThrowRate: percentage(
      summedTeamTotals.freeThrowsAttempted,
      summedTeamTotals.fieldGoalsAttempted,
    ),
    rimRate: percentage(
      summedTeamTotals.rimFieldGoalsAttempted,
      summedTeamTotals.fieldGoalsAttempted,
    ),
    midRate: percentage(
      summedTeamTotals.midFieldGoalsAttempted,
      summedTeamTotals.fieldGoalsAttempted,
    ),
    threePointRate: percentage(
      summedTeamTotals.threePointersAttempted,
      summedTeamTotals.fieldGoalsAttempted,
    ),
    rimFgPct: percentage(
      summedTeamTotals.rimFieldGoalsMade,
      summedTeamTotals.rimFieldGoalsAttempted,
    ),
    midFgPct: percentage(
      summedTeamTotals.midFieldGoalsMade,
      summedTeamTotals.midFieldGoalsAttempted,
    ),
    threeFgPct: percentage(
      summedTeamTotals.threePointersMade,
      summedTeamTotals.threePointersAttempted,
    ),
    transitionRate: percentage(totalTransitionPossessions, totalPossessions),
    transitionPoints: meanLabel(totalTransitionPoints / Math.max(gamesScanned, 1), 1),
    secondChancePoints: meanLabel(totalSecondChancePoints / Math.max(gamesScanned, 1), 1),
    pointsOffTurnovers: meanLabel(totalPointsOffTurnovers / Math.max(gamesScanned, 1), 1),
    paintPoints: meanLabel(totalPaintPoints / Math.max(gamesScanned, 1), 1),
  };
  const defense = {
    efg: percentage(
      summedOpponentTotals.fieldGoalsMade + (0.5 * summedOpponentTotals.threePointersMade),
      summedOpponentTotals.fieldGoalsAttempted,
    ),
    tovRate: percentage(
      summedOpponentTotals.turnovers,
      summedOpponentTotals.fieldGoalsAttempted + (0.44 * summedOpponentTotals.freeThrowsAttempted) + summedOpponentTotals.turnovers,
    ),
    orbPctAllowed: percentage(
      summedOpponentTotals.reboundsOffensive,
      summedOpponentTotals.reboundsOffensive + teamDefensiveRebounds,
    ),
    freeThrowRateAllowed: percentage(
      summedOpponentTotals.freeThrowsAttempted,
      summedOpponentTotals.fieldGoalsAttempted,
    ),
    rimRateAllowed: percentage(
      summedOpponentTotals.rimFieldGoalsAttempted,
      summedOpponentTotals.fieldGoalsAttempted,
    ),
    threePointRateAllowed: percentage(
      summedOpponentTotals.threePointersAttempted,
      summedOpponentTotals.fieldGoalsAttempted,
    ),
    transitionPointsAllowed: meanLabel(totalOpponentTransitionPoints / Math.max(gamesScanned, 1), 1),
    secondChancePointsAllowed: meanLabel(totalOpponentSecondChancePoints / Math.max(gamesScanned, 1), 1),
    pointsOffTurnoversAllowed: meanLabel(totalOpponentPointsOffTurnovers / Math.max(gamesScanned, 1), 1),
    paintPointsAllowed: meanLabel(totalOpponentPaintPoints / Math.max(gamesScanned, 1), 1),
    deflections: meanLabel(totalDeflections / Math.max(gamesScanned, 1), 1),
    chargesDrawn: meanLabel(totalChargesDrawn / Math.max(gamesScanned, 1), 1),
  };

  const players = [...playerMap.values()].map((player) => {
    const games = Math.max(1, safeNumber(player.games, 0));
    const minutes = safeNumber(player.minutes, 0);
    return {
      name: String(player.name || "Unknown").trim(),
      games,
      minutesPerGame: formatSecondsClock(minutes / games),
      pointsPerGame: meanLabel(safeNumber(player.points, 0) / games, 1),
      assistsPerGame: meanLabel(safeNumber(player.assists, 0) / games, 1),
      reboundsPerGame: meanLabel(safeNumber(player.rebounds, 0) / games, 1),
      threePointPct: percentage(
        safeNumber(player.threesMade, 0),
        safeNumber(player.threesAttempted, 0),
      ),
      turnoversPerGame: meanLabel(safeNumber(player.turnovers, 0) / games, 1),
    };
  });

  const topScorers = [...players]
    .sort((left, right) => right.pointsPerGame - left.pointsPerGame)
    .slice(0, 4);
  const topCreators = [...players]
    .sort((left, right) => right.assistsPerGame - left.assistsPerGame)
    .slice(0, 3);
  const topRebounders = [...players]
    .sort((left, right) => right.reboundsPerGame - left.reboundsPerGame)
    .slice(0, 3);

  const lineupNotes = [...lineupMap.values()]
    .filter((lineup) => lineup.seconds >= 120)
    .sort((left, right) => right.seconds - left.seconds)
    .slice(0, 4)
    .map((lineup) => ({
      label: lineup.label,
      minutes: formatSecondsClock(lineup.seconds),
      plusMinus: lineup.plusMinus,
      games: lineup.games.size,
    }));

  const recentGames = [...gameSnapshots]
    .sort((left, right) => compareDateKeys(String(right.date || ""), String(left.date || "")))
    .slice(0, 5)
    .map((game) => {
      const scorerText = game.topScorer ? `${game.topScorer.name} ${game.topScorer.points}` : "Balanced scoring";
      return `${game.date}: ${game.result} vs ${game.opponent.tricode} (${game.score}, ${game.margin > 0 ? "+" : ""}${game.margin}) · top scorer ${scorerText}`;
    });
  const notableStats = [
    ...buildSplitOutlierNotes(String(team?.teamTricode || team?.teamName || "TEAM").trim(), gameSnapshots),
    ...buildThresholdRecordNotes(String(team?.teamTricode || team?.teamName || "TEAM").trim(), gameSnapshots, topScorers),
  ].slice(0, 4);

  return {
    team: {
      teamId,
      tricode: String(team?.teamTricode || team?.teamName || "TEAM").trim(),
      name: String(team?.teamName || team?.teamTricode || "Team").trim(),
    },
    selection: {
      ...selection,
      gamesScanned,
      startDate: bundles[0]?.gameDate || selection.startDate,
      endDate: bundles[bundles.length - 1]?.gameDate || selection.endDate,
    },
    sample: {
      wins,
      losses,
      averageMargin: meanLabel(totalMargin / Math.max(gamesScanned, 1), 1),
      averagePointsFor: meanLabel(totalPointsFor / Math.max(gamesScanned, 1), 1),
      averagePointsAgainst: meanLabel(totalPointsAgainst / Math.max(gamesScanned, 1), 1),
      offensiveRating: meanLabel((totalPointsFor / Math.max(totalPossessions, 1)) * 100, 1),
      defensiveRating: meanLabel((totalPointsAgainst / Math.max(totalPossessions, 1)) * 100, 1),
      netRating: meanLabel(((totalPointsFor - totalPointsAgainst) / Math.max(totalPossessions, 1)) * 100, 1),
      possessions: meanLabel(totalPossessions / Math.max(gamesScanned, 1), 1),
    },
    offense,
    defense,
    players: {
      topScorers,
      topCreators,
      topRebounders,
    },
    lineupNotes,
    notableStats,
    recentGames,
    gameSnapshots,
  };
}

function buildTemplatePacket(features: ReturnType<typeof buildFeaturePayload>) {
  const { team, sample, offense, defense, players, lineupNotes, notableStats, recentGames, selection } = features;
  const windowLabel = selection.gamesScanned === 1 ? "game" : "games";
  const sections = [
    {
      title: "Sample",
      items: [
        `${team.tricode} went ${sample.wins}-${sample.losses} over ${selection.gamesScanned} ${windowLabel} with a ${sample.netRating > 0 ? "+" : ""}${sample.netRating} net rating.`,
        `Average score: ${sample.averagePointsFor}-${sample.averagePointsAgainst}; possessions sat at ${sample.possessions} per game.`,
      ],
    },
    {
      title: "Offense",
      items: [
        `${team.tricode} posted ${offense.efg}% eFG with a ${offense.threePointRate}% 3PA rate and ${offense.rimRate}% rim rate.`,
        `They averaged ${offense.transitionPoints} transition points, ${offense.paintPoints} paint points, and ${offense.pointsOffTurnovers} points off turnovers.`,
      ],
    },
    {
      title: "Defense",
      items: [
        `Opponents produced ${defense.efg}% eFG with a ${defense.threePointRateAllowed}% 3PA rate and ${defense.freeThrowRateAllowed} FTr.`,
        `${team.tricode} allowed ${defense.transitionPointsAllowed} transition points and ${defense.paintPointsAllowed} paint points per game.`,
      ],
    },
    {
      title: "Personnel",
      items: [
        players.topScorers[0]
          ? `${players.topScorers[0].name} led the sample at ${players.topScorers[0].pointsPerGame} PPG.`
          : "No standout scoring leader in this sample.",
        players.topCreators[0]
          ? `${players.topCreators[0].name} paced creation at ${players.topCreators[0].assistsPerGame} APG.`
          : "No standout creation leader in this sample.",
      ],
    },
  ];

  if (lineupNotes.length) {
    sections.push({
      title: "Lineups",
      items: lineupNotes.slice(0, 2).map((lineup) => (
        `${lineup.label} logged ${lineup.minutes} across ${lineup.games} game${lineup.games === 1 ? "" : "s"} and was ${lineup.plusMinus > 0 ? "+" : ""}${lineup.plusMinus}.`
      )),
    });
  }

  if (notableStats.length) {
    sections.push({
      title: "Outliers",
      items: notableStats.slice(0, 2),
    });
  }

  return {
    source: "template",
    headline: `${team.tricode} pre-game scout from ${selection.rangeLabel}.`,
    summary: `${team.tricode} comes in with a ${sample.wins}-${sample.losses} sample, ${sample.averagePointsFor} points scored, ${sample.averagePointsAgainst} allowed, and a ${sample.netRating > 0 ? "+" : ""}${sample.netRating} net rating over this window.`,
    sections: sections.slice(0, 5),
    packetDetails: {
      sampleNotes: [
        `Window: ${selection.startDate} to ${selection.endDate}.`,
        `Record: ${sample.wins}-${sample.losses}. Average margin: ${sample.averageMargin > 0 ? "+" : ""}${sample.averageMargin}.`,
      ],
      offensiveProfile: [
        `eFG ${offense.efg}% · TOV% ${offense.tovRate}% · ORB% ${offense.orbPct}% · FTr ${offense.freeThrowRate}.`,
        `Rim rate ${offense.rimRate}% · Mid rate ${offense.midRate}% · 3P rate ${offense.threePointRate}%.`,
        `Transition ${offense.transitionPoints} · Paint ${offense.paintPoints} · 2nd chance ${offense.secondChancePoints}.`,
      ],
      defensiveProfile: [
        `Opp eFG ${defense.efg}% · forced TOV% ${defense.tovRate}% · opp ORB% ${defense.orbPctAllowed}% · opp FTr ${defense.freeThrowRateAllowed}.`,
        `Allowed transition ${defense.transitionPointsAllowed} · paint ${defense.paintPointsAllowed} · 2nd chance ${defense.secondChancePointsAllowed}.`,
      ],
      playerNotes: [
        ...players.topScorers.slice(0, 3).map((player) => `${player.name}: ${player.pointsPerGame} PPG in ${player.minutesPerGame}.`),
        ...players.topCreators.slice(0, 2).map((player) => `${player.name}: ${player.assistsPerGame} APG.`),
      ].slice(0, 5),
      notableStats,
      lineupNotes: lineupNotes.map((lineup) => (
        `${lineup.label} · ${lineup.minutes} · ${lineup.plusMinus > 0 ? "+" : ""}${lineup.plusMinus}`
      )),
      recentGames,
    },
  };
}

async function generateAiPacket(features: ReturnType<typeof buildFeaturePayload>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const systemPrompt = [
    "You are a basketball scout preparing a concise pre-game packet.",
    "Use only the structured team sample provided.",
    "Do not invent stats, lineup results, game outcomes, or player tendencies.",
    "Prioritize repeatable tendencies over one-game noise.",
    "Anchor every claim to the sample size and the date/game window.",
    "When a team has a clear offensive or defensive identity in the sample, center the packet on that identity.",
    "If the sample includes notable win-loss split outliers or strong threshold-based records, use them, but only when they are clearly supported by the provided data.",
    "Return compact JSON with keys: headline, summary, sections.",
    "sections must be an array of 3 to 5 objects with keys: title and items.",
    "Each section should have 1 to 3 concise bullet strings.",
  ].join(" ");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(features) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) return null;

  const parsed = JSON.parse(content);
  return {
    source: "ai",
    headline: String(parsed?.headline || "").trim(),
    summary: String(parsed?.summary || "").trim(),
    sections: Array.isArray(parsed?.sections)
      ? parsed.sections
        .map((section: unknown) => {
          if (!section || typeof section !== "object" || Array.isArray(section)) return null;
          const title = String((section as Record<string, unknown>).title || "").trim();
          const items = Array.isArray((section as Record<string, unknown>).items)
            ? ((section as Record<string, unknown>).items as unknown[])
              .map((item) => String(item || "").trim())
              .filter(Boolean)
              .slice(0, 3)
            : [];
          if (!title || !items.length) return null;
          return { title, items };
        })
        .filter(Boolean)
        .slice(0, 5)
      : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId || "").trim();
    const mode = String(body?.mode || "games").trim() === "dates" ? "dates" : "games";
    const requestedGameCount = Math.min(20, Math.max(1, safeNumber(body?.gameCount, 5)));
    const startDate = String(body?.startDate || "").trim();
    const endDate = String(body?.endDate || "").trim();

    if (!teamId) {
      return jsonResponse(400, { error: "A team is required." });
    }
    if (mode === "dates" && (!parseIsoDateKey(startDate) || !parseIsoDateKey(endDate))) {
      return jsonResponse(400, { error: "Valid start and end dates are required." });
    }

    const selectedGames = mode === "dates"
      ? await collectGamesByDateRange(teamId, startDate, endDate)
      : await collectPreviousGames(teamId, requestedGameCount);

    if (!selectedGames.length) {
      return jsonResponse(404, { error: "No completed games found for that team in the selected range." });
    }

    const bundles = await Promise.all(
      selectedGames.map((gameCard) => fetchGameBundle(gameCard).catch(() => null)),
    );
    const resolvedBundles = bundles.filter(Boolean) as Array<{
      gameId: string;
      game: Record<string, unknown>;
      minutesData: Record<string, unknown> | null;
      gameDate: string;
    }>;

    if (!resolvedBundles.length) {
      return jsonResponse(500, { error: "Unable to load the selected games." });
    }

    const features = buildFeaturePayload(teamId, {
      mode,
      gameCount: requestedGameCount,
      startDate,
      endDate,
      rangeLabel: buildRangeLabel(mode, requestedGameCount, startDate, endDate),
    }, resolvedBundles);
    const templatePacket = buildTemplatePacket(features);

    let packet = templatePacket;
    try {
      const aiPacket = await generateAiPacket(features);
      if (aiPacket?.headline && aiPacket?.summary && Array.isArray(aiPacket?.sections) && aiPacket.sections.length) {
        packet = {
          ...templatePacket,
          ...aiPacket,
        };
      }
    } catch {
      // Keep the deterministic template response when AI is unavailable.
    }

    return jsonResponse(200, {
      ...packet,
      rangeLabel: `${features.selection.startDate} to ${features.selection.endDate}`,
      team: features.team,
      selection: features.selection,
      sample: features.sample,
      gameSnapshots: features.gameSnapshots,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to generate pre-game scouting packet.",
    });
  }
});
