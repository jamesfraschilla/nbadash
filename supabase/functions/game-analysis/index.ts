import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = Deno.env.get("OPENAI_ANALYSIS_MODEL") || "gpt-4.1-mini";

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

function periodLengthSeconds(period: number) {
  return period > 4 ? 5 * 60 : 12 * 60;
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

function pointToElapsedSeconds(period: number, clock: unknown) {
  let elapsed = 0;
  for (let current = 1; current < period; current += 1) {
    elapsed += periodLengthSeconds(current);
  }
  const remaining = parseClockToSeconds(clock);
  return elapsed + Math.max(0, periodLengthSeconds(period) - remaining);
}

function periodLabel(period: number) {
  if (period <= 4) return `Q${period}`;
  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? "OT" : `${overtimeNumber}OT`;
}

function formatPointLabel(period: number, clock: unknown) {
  return `${periodLabel(period)} ${normalizeClock(clock) || "0:00"}`;
}

function formatSecondsClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatSignedValue(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function teamLabel(team: Record<string, unknown> | null | undefined) {
  return String(team?.teamTricode || team?.teamName || "Team");
}

function describeLineup(players: Array<Record<string, unknown>>) {
  return (Array.isArray(players) ? players : [])
    .map((player) => String(player?.nameI || player?.fullName || player?.playerName || "").trim())
    .filter(Boolean)
    .join(", ");
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase function secrets are missing.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAdmin(adminClient: ReturnType<typeof createClient>, req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const cloned = req.clone();
    const body = await cloned.json().catch(() => ({}));
    token = typeof body?.accessToken === "string" ? body.accessToken : "";
  }
  if (!token) {
    return { error: "Missing authorization token.", status: 401 } as const;
  }

  const { data: userData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !userData?.user?.id) {
    return { error: "Unable to verify session.", status: 401 } as const;
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,role,status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin" || profile.status !== "active") {
    return { error: "Admin access required.", status: 403 } as const;
  }

  return { adminUserId: profile.id } as const;
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function actionChronologyValue(action: Record<string, unknown>) {
  const period = safeNumber(action.period, 0);
  const elapsed = pointToElapsedSeconds(period, action.clock);
  const order = safeNumber(action.orderNumber ?? action.actionNumber, 0);
  return { period, elapsed, order };
}

function sortActions(actions: Array<Record<string, unknown>>) {
  return [...actions].sort((a, b) => {
    const aValue = actionChronologyValue(a);
    const bValue = actionChronologyValue(b);
    if (aValue.elapsed !== bValue.elapsed) return aValue.elapsed - bValue.elapsed;
    return aValue.order - bValue.order;
  });
}

function numericScore(action: Record<string, unknown>, side: "home" | "away") {
  return safeNumber(side === "home" ? action.scoreHome : action.scoreAway, 0);
}

function buildScoringEvents(actions: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string) {
  let previousHome = 0;
  let previousAway = 0;

  return actions.flatMap((action) => {
    const nextHome = numericScore(action, "home");
    const nextAway = numericScore(action, "away");
    const homeDiff = nextHome - previousHome;
    const awayDiff = nextAway - previousAway;
    previousHome = nextHome;
    previousAway = nextAway;

    if (homeDiff <= 0 && awayDiff <= 0) return [];

    const scoringTeamId = homeDiff > awayDiff ? homeTeamId : awayDiff > homeDiff ? awayTeamId : String(action.teamId || "");
    const points = Math.max(homeDiff, awayDiff);
    return [{
      actionNumber: safeNumber(action.actionNumber, 0),
      period: safeNumber(action.period, 0),
      clock: normalizeClock(action.clock),
      elapsed: pointToElapsedSeconds(safeNumber(action.period, 0), action.clock),
      teamId: scoringTeamId,
      points,
      description: String(action.description || action.actionType || "").trim(),
      scoreHome: nextHome,
      scoreAway: nextAway,
    }];
  });
}

function findScoreAtOrBefore(actions: Array<Record<string, unknown>>, elapsed: number) {
  let home = 0;
  let away = 0;
  for (const action of actions) {
    const actionElapsed = pointToElapsedSeconds(safeNumber(action.period, 0), action.clock);
    if (actionElapsed > elapsed) break;
    home = numericScore(action, "home");
    away = numericScore(action, "away");
  }
  return { home, away };
}

function classifyShot(action: Record<string, unknown>) {
  const actionType = String(action.actionType || "").toLowerCase();
  if (actionType === "3pt") return "three";
  const distance = safeNumber(action.shotDistance, 0);
  return distance <= 4.9 ? "rim" : "mid";
}

function isPersonalFoul(action: Record<string, unknown>) {
  const subType = String(action.subType || "").toLowerCase();
  return !subType.includes("technical");
}

function normalizeQualifiers(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").toLowerCase());
  }
  if (typeof value === "string" && value) {
    return value.split(/[\s,|]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function percentage(made: number, attempted: number) {
  if (!attempted) return 0;
  return Number(((made / attempted) * 100).toFixed(1));
}

function buildTeamActionTotals(teamId: string) {
  return {
    teamId,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    rimFieldGoalsMade: 0,
    rimFieldGoalsAttempted: 0,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
    reboundsTotal: 0,
    reboundsOffensive: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
    assists: 0,
    foulsPersonal: 0,
    transitionPoints: 0,
    transitionPossessions: 0,
    transitionTurnovers: 0,
    secondChancePoints: 0,
    pointsOffTurnovers: 0,
    paintPoints: 0,
  };
}

function aggregateRangeStats(
  rangeActions: Array<Record<string, unknown>>,
  scoringEvents: Array<Record<string, unknown>>,
  homeTeamId: string,
  awayTeamId: string,
) {
  const totals: Record<string, ReturnType<typeof buildTeamActionTotals>> = {
    [homeTeamId]: buildTeamActionTotals(homeTeamId),
    [awayTeamId]: buildTeamActionTotals(awayTeamId),
  };

  const scoringByActionNumber = new Map<number, number>();
  scoringEvents.forEach((event) => {
    scoringByActionNumber.set(safeNumber(event.actionNumber, 0), safeNumber(event.points, 0));
    const teamTotals = totals[String(event.teamId || "")];
    if (teamTotals) {
      teamTotals.points += safeNumber(event.points, 0);
    }
  });

  for (const action of rangeActions) {
    const teamId = String(action.teamId || "");
    const actionType = String(action.actionType || "").toLowerCase();
    const teamTotals = totals[teamId];
    const opponentId = teamId === homeTeamId ? awayTeamId : homeTeamId;
    const opponentTotals = totals[opponentId];
    const qualifiers = normalizeQualifiers(action.qualifiers);
    const points = scoringByActionNumber.get(safeNumber(action.actionNumber, 0)) || 0;
    const made = points > 0 || String(action.shotResult || "").toLowerCase() === "made";

    if (actionType === "2pt" || actionType === "3pt") {
      if (teamTotals) {
        teamTotals.fieldGoalsAttempted += 1;
        if (actionType === "3pt") teamTotals.threePointersAttempted += 1;
        const shotType = classifyShot(action);
        if (shotType === "rim") teamTotals.rimFieldGoalsAttempted += 1;
        if (shotType === "mid") teamTotals.midFieldGoalsAttempted += 1;
        if (qualifiers.includes("fastbreak")) teamTotals.transitionPossessions += 1;
      }
      if (made && teamTotals) {
        teamTotals.fieldGoalsMade += 1;
        if (actionType === "3pt") teamTotals.threePointersMade += 1;
        const shotType = classifyShot(action);
        if (shotType === "rim") teamTotals.rimFieldGoalsMade += 1;
        if (shotType === "mid") teamTotals.midFieldGoalsMade += 1;
        if (qualifiers.includes("fastbreak")) teamTotals.transitionPoints += points;
        if (qualifiers.includes("secondchance")) teamTotals.secondChancePoints += points;
        if (qualifiers.includes("fromturnover")) teamTotals.pointsOffTurnovers += points;
        if (qualifiers.includes("pointsinthepaint")) teamTotals.paintPoints += points;
      }
    }

    if (actionType === "freethrow" && teamTotals) {
      teamTotals.freeThrowsAttempted += 1;
      if (made) teamTotals.freeThrowsMade += 1;
    }

    if (actionType === "rebound" && teamTotals) {
      const subType = String(action.subType || "").toLowerCase();
      teamTotals.reboundsTotal += 1;
      if (subType.includes("offensive")) {
        teamTotals.reboundsOffensive += 1;
      }
    }

    if (actionType === "turnover" && teamTotals) {
      teamTotals.turnovers += 1;
      if (opponentTotals) opponentTotals.transitionTurnovers += 1;
    }

    if (actionType === "steal" && teamTotals) {
      teamTotals.steals += 1;
    }

    if (actionType === "block" && teamTotals) {
      teamTotals.blocks += 1;
    }

    if (actionType === "assist" && teamTotals) {
      teamTotals.assists += 1;
    }

    if (actionType === "foul" && teamTotals && isPersonalFoul(action)) {
      teamTotals.foulsPersonal += 1;
    }
  }

  return totals;
}

function buildRunSummary(scoringEvents: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string) {
  const bestByTeam: Record<string, { points: number; startLabel: string; endLabel: string } | null> = {
    [homeTeamId]: null,
    [awayTeamId]: null,
  };

  let currentTeamId = "";
  let currentPoints = 0;
  let currentStartLabel = "";

  for (const event of scoringEvents) {
    const teamId = String(event.teamId || "");
    const label = formatPointLabel(safeNumber(event.period, 0), event.clock);
    if (teamId !== currentTeamId) {
      currentTeamId = teamId;
      currentPoints = safeNumber(event.points, 0);
      currentStartLabel = label;
    } else {
      currentPoints += safeNumber(event.points, 0);
    }

    const previousBest = bestByTeam[teamId];
    if (!previousBest || currentPoints > previousBest.points) {
      bestByTeam[teamId] = {
        points: currentPoints,
        startLabel: currentStartLabel,
        endLabel: label,
      };
    }
  }

  return bestByTeam;
}

function buildLineupInsights(
  minutesData: Record<string, unknown> | null,
  rangeStartElapsed: number,
  rangeEndElapsed: number,
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
  homeMargin: number,
  awayMargin: number,
) {
  const rangeSeconds = Math.max(1, rangeEndElapsed - rangeStartElapsed);
  const stintNotes: Array<{
    teamId: string;
    seconds: number;
    margin: number;
    players: string;
  }> = [];
  const playerSplits = new Map<string, {
    teamId: string;
    name: string;
    onSeconds: number;
    onMargin: number;
  }>();

  const upsertPlayer = (teamId: string, player: Record<string, unknown>, margin: number, seconds: number) => {
    const personId = String(player?.personId || "");
    const name = String(player?.nameI || player?.fullName || player?.playerName || "").trim();
    if (!personId || !name || seconds <= 0) return;
    const key = `${teamId}:${personId}`;
    if (!playerSplits.has(key)) {
      playerSplits.set(key, {
        teamId,
        name,
        onSeconds: 0,
        onMargin: 0,
      });
    }
    const entry = playerSplits.get(key)!;
    entry.onSeconds += seconds;
    entry.onMargin += margin;
  };

  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods : [];
  for (const periodRow of periods) {
    const period = safeNumber(periodRow?.period, 0);
    const stints = Array.isArray(periodRow?.stints) ? periodRow.stints : [];
    for (const stint of stints) {
      const stintStart = pointToElapsedSeconds(period, stint.startClock);
      const stintEnd = pointToElapsedSeconds(period, stint.endClock);
      const overlapStart = Math.max(rangeStartElapsed, stintStart);
      const overlapEnd = Math.min(rangeEndElapsed, stintEnd);
      const overlapSeconds = overlapEnd - overlapStart;
      if (overlapSeconds <= 0) continue;

      const fullSeconds = Math.max(1, stintEnd - stintStart);
      const weight = overlapSeconds / fullSeconds;
      const weightedHomeMargin = safeNumber(stint.plusMinus, 0) * weight;
      const weightedAwayMargin = -weightedHomeMargin;

      const homePlayers = Array.isArray(stint.playersHome) ? stint.playersHome : [];
      const awayPlayers = Array.isArray(stint.playersAway) ? stint.playersAway : [];

      stintNotes.push({
        teamId: String(homeTeam.teamId),
        seconds: overlapSeconds,
        margin: weightedHomeMargin,
        players: describeLineup(homePlayers),
      });
      stintNotes.push({
        teamId: String(awayTeam.teamId),
        seconds: overlapSeconds,
        margin: weightedAwayMargin,
        players: describeLineup(awayPlayers),
      });

      homePlayers.forEach((player) => upsertPlayer(String(homeTeam.teamId), player, weightedHomeMargin, overlapSeconds));
      awayPlayers.forEach((player) => upsertPlayer(String(awayTeam.teamId), player, weightedAwayMargin, overlapSeconds));
    }
  }

  const topStints = [String(homeTeam.teamId), String(awayTeam.teamId)]
    .map((teamId) => {
      const ranked = stintNotes
        .filter((entry) => entry.teamId === teamId && entry.seconds >= 60)
        .sort((a, b) => b.margin - a.margin);
      return ranked[0] || null;
    })
    .filter(Boolean)
    .map((entry) => {
      const team = String(entry!.teamId) === String(homeTeam.teamId) ? homeTeam : awayTeam;
      return `${teamLabel(team)} best stint: ${describeLineupString(entry!.players)} was ${formatSignedValue(Math.round(entry!.margin))} in ${formatSecondsClock(entry!.seconds)}.`;
    });

  const playerNotes = [String(homeTeam.teamId), String(awayTeam.teamId)]
    .map((teamId) => {
      const teamMargin = teamId === String(homeTeam.teamId) ? homeMargin : awayMargin;
      const candidates = [...playerSplits.values()]
        .filter((entry) => entry.teamId === teamId && entry.onSeconds >= 120 && entry.onSeconds < rangeSeconds)
        .map((entry) => {
          const offSeconds = rangeSeconds - entry.onSeconds;
          if (offSeconds < 60) return null;
          const offMargin = teamMargin - entry.onMargin;
          const onPer40 = (entry.onMargin / entry.onSeconds) * (40 * 60);
          const offPer40 = (offMargin / offSeconds) * (40 * 60);
          return {
            ...entry,
            offSeconds,
            onPer40,
            offPer40,
            differential: onPer40 - offPer40,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b!.differential) - Math.abs(a!.differential));
      return candidates[0] || null;
    })
    .filter(Boolean)
    .map((entry) => {
      const team = entry!.teamId === String(homeTeam.teamId) ? homeTeam : awayTeam;
      return `${teamLabel(team)} on/off: ${entry!.name} was ${formatSignedValue(Math.round(entry!.onPer40))} per 40 on court versus ${formatSignedValue(Math.round(entry!.offPer40))} per 40 off court in this span.`;
    });

  return {
    lineupNotes: [...topStints, ...playerNotes].slice(0, 4),
  };
}

function describeLineupString(players: string) {
  if (!players) return "That group";
  return players;
}

function buildFeaturePayload(
  game: Record<string, unknown>,
  minutesData: Record<string, unknown> | null,
  range: Record<string, unknown>,
) {
  const homeTeam = (game.homeTeam || {}) as Record<string, unknown>;
  const awayTeam = (game.awayTeam || {}) as Record<string, unknown>;
  const homeTeamId = String(homeTeam.teamId || "");
  const awayTeamId = String(awayTeam.teamId || "");
  const actions = sortActions(Array.isArray(game.playByPlayActions) ? game.playByPlayActions : []);

  const minPeriod = safeNumber(range.minPeriod, 1);
  const maxPeriod = safeNumber(range.maxPeriod, 1);
  const minClock = String(range.minClock || "12:00");
  const maxClock = String(range.maxClock || "0:00");
  const rangeStartElapsed = pointToElapsedSeconds(minPeriod, minClock);
  const rangeEndElapsed = pointToElapsedSeconds(maxPeriod, maxClock);
  const allowedMaxElapsed = game.gameStatus === 2
    ? pointToElapsedSeconds(safeNumber(game.period, maxPeriod), game.gameClock)
    : pointToElapsedSeconds(Math.max(1, safeNumber(game.period, maxPeriod)), "0:00");

  if (rangeEndElapsed > allowedMaxElapsed) {
    throw new Error(`Max time cannot be later than ${formatPointLabel(safeNumber(game.period, maxPeriod), game.gameClock || "0:00")}.`);
  }

  if (rangeStartElapsed >= rangeEndElapsed) {
    throw new Error("Min time must be earlier than max time.");
  }

  const rangeActions = actions.filter((action) => {
    const elapsed = pointToElapsedSeconds(safeNumber(action.period, 0), action.clock);
    return elapsed >= rangeStartElapsed && elapsed <= rangeEndElapsed;
  });

  const allScoringEvents = buildScoringEvents(actions, homeTeamId, awayTeamId);
  const scoringEvents = allScoringEvents.filter((event) => event.elapsed >= rangeStartElapsed && event.elapsed <= rangeEndElapsed);
  const startScore = findScoreAtOrBefore(actions, rangeStartElapsed);
  const endScore = findScoreAtOrBefore(actions, rangeEndElapsed);
  const homePoints = endScore.home - startScore.home;
  const awayPoints = endScore.away - startScore.away;
  const homeMargin = homePoints - awayPoints;
  const awayMargin = -homeMargin;

  const totals = aggregateRangeStats(rangeActions, scoringEvents, homeTeamId, awayTeamId);
  const runs = buildRunSummary(scoringEvents, homeTeamId, awayTeamId);
  const lineupInsights = buildLineupInsights(
    minutesData,
    rangeStartElapsed,
    rangeEndElapsed,
    homeTeam,
    awayTeam,
    homeMargin,
    awayMargin,
  );

  const homeTotals = totals[homeTeamId];
  const awayTotals = totals[awayTeamId];

  return {
    range: {
      startLabel: formatPointLabel(minPeriod, minClock),
      endLabel: formatPointLabel(maxPeriod, maxClock),
      duration: formatSecondsClock(rangeEndElapsed - rangeStartElapsed),
      isLive: safeNumber(game.gameStatus, 0) === 2,
    },
    score: {
      start: {
        home: startScore.home,
        away: startScore.away,
      },
      end: {
        home: endScore.home,
        away: endScore.away,
      },
      rangePoints: {
        home: homePoints,
        away: awayPoints,
      },
      margin: {
        home: homeMargin,
        away: awayMargin,
      },
    },
    teams: {
      home: {
        tricode: teamLabel(homeTeam),
        name: String(homeTeam.teamName || teamLabel(homeTeam)),
        totals: homeTotals,
        shooting: {
          fgPct: percentage(homeTotals.fieldGoalsMade, homeTotals.fieldGoalsAttempted),
          rimPct: percentage(homeTotals.rimFieldGoalsMade, homeTotals.rimFieldGoalsAttempted),
          midPct: percentage(homeTotals.midFieldGoalsMade, homeTotals.midFieldGoalsAttempted),
          threePct: percentage(homeTotals.threePointersMade, homeTotals.threePointersAttempted),
          ftPct: percentage(homeTotals.freeThrowsMade, homeTotals.freeThrowsAttempted),
        },
        largestRun: runs[homeTeamId],
      },
      away: {
        tricode: teamLabel(awayTeam),
        name: String(awayTeam.teamName || teamLabel(awayTeam)),
        totals: awayTotals,
        shooting: {
          fgPct: percentage(awayTotals.fieldGoalsMade, awayTotals.fieldGoalsAttempted),
          rimPct: percentage(awayTotals.rimFieldGoalsMade, awayTotals.rimFieldGoalsAttempted),
          midPct: percentage(awayTotals.midFieldGoalsMade, awayTotals.midFieldGoalsAttempted),
          threePct: percentage(awayTotals.threePointersMade, awayTotals.threePointersAttempted),
          ftPct: percentage(awayTotals.freeThrowsMade, awayTotals.freeThrowsAttempted),
        },
        largestRun: runs[awayTeamId],
      },
    },
    lineupNotes: lineupInsights.lineupNotes,
  };
}

function buildSwingFactors(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const factors = [
    {
      label: "turnovers",
      value: away.totals.turnovers - home.totals.turnovers,
      text: `${home.tricode} won turnovers ${formatSignedValue(away.totals.turnovers - home.totals.turnovers)} (${home.totals.turnovers} to ${away.totals.turnovers}).`,
    },
    {
      label: "paint",
      value: home.totals.paintPoints - away.totals.paintPoints,
      text: `${home.tricode} paint points edge: ${home.totals.paintPoints}-${away.totals.paintPoints}.`,
    },
    {
      label: "transition",
      value: home.totals.transitionPoints - away.totals.transitionPoints,
      text: `${home.tricode} transition points edge: ${home.totals.transitionPoints}-${away.totals.transitionPoints}.`,
    },
    {
      label: "secondChance",
      value: home.totals.secondChancePoints - away.totals.secondChancePoints,
      text: `${home.tricode} second-chance points edge: ${home.totals.secondChancePoints}-${away.totals.secondChancePoints}.`,
    },
    {
      label: "pointsOffTurnovers",
      value: home.totals.pointsOffTurnovers - away.totals.pointsOffTurnovers,
      text: `${home.tricode} points off turnovers edge: ${home.totals.pointsOffTurnovers}-${away.totals.pointsOffTurnovers}.`,
    },
  ]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .filter((item) => item.value !== 0)
    .slice(0, 3)
    .map((item) => item.text);

  const runNotes = [features.teams.home, features.teams.away]
    .filter((team) => team.largestRun?.points)
    .sort((a, b) => safeNumber(b.largestRun?.points, 0) - safeNumber(a.largestRun?.points, 0))
    .slice(0, 1)
    .map((team) => `${team.tricode} had the largest unanswered run at ${team.largestRun?.points}-0 from ${team.largestRun?.startLabel} to ${team.largestRun?.endLabel}.`);

  return [...runNotes, ...factors].slice(0, 4);
}

function buildStatOutliers(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const notes = [];

  notes.push(`${home.tricode} shot ${home.totals.fieldGoalsMade}-${home.totals.fieldGoalsAttempted} (${home.shooting.fgPct}%) versus ${away.tricode} at ${away.totals.fieldGoalsMade}-${away.totals.fieldGoalsAttempted} (${away.shooting.fgPct}%).`);
  notes.push(`${home.tricode} rim scoring was ${home.totals.rimFieldGoalsMade}-${home.totals.rimFieldGoalsAttempted}; ${away.tricode} was ${away.totals.rimFieldGoalsMade}-${away.totals.rimFieldGoalsAttempted}.`);
  notes.push(`${home.tricode} from three: ${home.totals.threePointersMade}-${home.totals.threePointersAttempted}; ${away.tricode}: ${away.totals.threePointersMade}-${away.totals.threePointersAttempted}.`);

  if (home.totals.freeThrowsAttempted !== away.totals.freeThrowsAttempted) {
    notes.push(`${home.tricode} free throws: ${home.totals.freeThrowsMade}-${home.totals.freeThrowsAttempted}; ${away.tricode}: ${away.totals.freeThrowsMade}-${away.totals.freeThrowsAttempted}.`);
  }

  return notes.slice(0, 4);
}

function buildTemplateAnalysis(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const homeMargin = safeNumber(features.score.margin.home, 0);
  const leader = homeMargin >= 0 ? home.tricode : away.tricode;
  const trailer = homeMargin >= 0 ? away.tricode : home.tricode;
  const margin = Math.abs(homeMargin);
  const leaderPoints = homeMargin >= 0 ? safeNumber(features.score.rangePoints.home, 0) : safeNumber(features.score.rangePoints.away, 0);
  const trailerPoints = homeMargin >= 0 ? safeNumber(features.score.rangePoints.away, 0) : safeNumber(features.score.rangePoints.home, 0);
  const swingFactors = buildSwingFactors(features);
  const statOutliers = buildStatOutliers(features);

  return {
    source: "template",
    headline: `${leader} ${margin === 0 ? "played even" : `won the stretch by ${margin}`} from ${features.range.startLabel} to ${features.range.endLabel}.`,
    summary: `${leader} outscored ${trailer} ${leaderPoints}-${trailerPoints} over ${features.range.duration}. The range moved from ${features.score.start.away}-${features.score.start.home} to ${features.score.end.away}-${features.score.end.home}.`,
    swingFactors,
    lineupNotes: features.lineupNotes,
    statOutliers,
    confidenceNotes: [
      "This pass uses API-only data for the selected game range.",
      "Lineup and on/off notes are estimated from overlapping minutes stints.",
    ],
  };
}

async function generateAiAnalysis(features: ReturnType<typeof buildFeaturePayload>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const systemPrompt = [
    "You are a basketball analyst.",
    "Use only the structured game data provided.",
    "Do not invent stats, possessions, or player impact claims.",
    "Focus on scoring swings, lineup/on-off effects, and stat outliers in the selected range.",
    "Return compact JSON with keys: headline, summary, swingFactors, lineupNotes, statOutliers, confidenceNotes.",
    "Each list must contain short strings.",
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
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(features),
        },
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
    swingFactors: Array.isArray(parsed?.swingFactors) ? parsed.swingFactors.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
    lineupNotes: Array.isArray(parsed?.lineupNotes) ? parsed.lineupNotes.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
    statOutliers: Array.isArray(parsed?.statOutliers) ? parsed.statOutliers.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
    confidenceNotes: Array.isArray(parsed?.confidenceNotes) ? parsed.confidenceNotes.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  let adminClient;
  try {
    adminClient = getAdminClient();
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Configuration error." });
  }

  const permission = await requireAdmin(adminClient, req);
  if ("error" in permission) {
    return jsonResponse(permission.status, { error: permission.error });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body?.gameId || "").trim();
    const range = typeof body?.range === "object" && body.range ? body.range : {};

    if (!/^\d{10}$/.test(gameId)) {
      return jsonResponse(400, { error: "A valid game ID is required." });
    }

    const game = await requestJson(`${API_BASE}/games/${gameId}`);
    const minutesData = await requestJson(`${API_BASE}/games/${gameId}/minutes`).catch(() => null);

    const features = buildFeaturePayload(game, minutesData, range);
    const templateAnalysis = buildTemplateAnalysis(features);

    let analysis = templateAnalysis;
    try {
      const aiAnalysis = await generateAiAnalysis(features);
      if (aiAnalysis?.headline && aiAnalysis?.summary) {
        analysis = aiAnalysis;
      }
    } catch {
      // Keep the deterministic template response when AI is unavailable.
    }

    return jsonResponse(200, {
      ...analysis,
      rangeLabel: `${features.range.startLabel} to ${features.range.endLabel}`,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to generate analysis.",
    });
  }
});
