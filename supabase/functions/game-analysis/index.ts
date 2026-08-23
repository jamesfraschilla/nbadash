import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = Deno.env.get("OPENAI_ANALYSIS_MODEL") || "gpt-4.1-mini";
const CACHE_TABLE = "game_analysis_segments";
const ANALYSIS_RESPONSE_SCHEMA = {
  name: "game_analysis_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: {
        type: "string",
      },
      summary: {
        type: "string",
      },
      sections: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: {
              type: "string",
            },
            items: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "string",
              },
            },
          },
          required: ["title", "items"],
        },
      },
    },
    required: ["headline", "summary", "sections"],
  },
};

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

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function requireAdminClient() {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Shared analysis cache is not configured.");
  }
  return supabase;
}

function bearerTokenFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1].trim() : "";
}

async function isAdminRequest(req: Request) {
  const token = bearerTokenFromRequest(req);
  if (!token) return false;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceRoleKey && token === serviceRoleKey) return true;

  const supabase = createAdminClient();
  if (!supabase) return false;

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user?.id) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", userData.user.id)
    .maybeSingle();

  return !profileError && profile?.role === "admin" && profile?.status === "active";
}

function stripAdminOnlyAnalysisMetadata(payload: Record<string, unknown>, isAdmin = false) {
  if (isAdmin) return payload;
  const sanitized: Record<string, unknown> = { ...payload };
  delete sanitized.ai;
  delete sanitized.fallbackReason;
  delete sanitized.dataQuality;
  delete sanitized.dataSignature;
  delete sanitized.source;

  if (sanitized.cache && typeof sanitized.cache === "object" && !Array.isArray(sanitized.cache)) {
    const cache = { ...(sanitized.cache as Record<string, unknown>) };
    delete cache.dataSignature;
    sanitized.cache = cache;
  }

  return sanitized;
}


function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isWnbaTeamId(teamId: unknown) {
  const numericTeamId = Number(teamId);
  return numericTeamId >= 1611661300 && numericTeamId < 1611661400;
}

function isSummerLeagueGameId(gameId: unknown) {
  return /^1(?:3|4|5|6)\d{8}$/.test(String(gameId || "").trim());
}

function inferRegulationMinutes(game: Record<string, unknown> | null | undefined, fallbackGameId = "") {
  const homeTeam = (game?.homeTeam || {}) as Record<string, unknown>;
  const awayTeam = (game?.awayTeam || {}) as Record<string, unknown>;
  if (
    isWnbaTeamId(homeTeam.teamId)
    || isWnbaTeamId(awayTeam.teamId)
    || String(fallbackGameId || "").startsWith("10")
    || isSummerLeagueGameId(game?.gameId || fallbackGameId)
  ) {
    return 10;
  }
  return 12;
}

function periodLengthSeconds(period: number, regulationMinutes = 12) {
  return period > 4 ? 5 * 60 : regulationMinutes * 60;
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

function pointToElapsedSeconds(period: number, clock: unknown, regulationMinutes = 12) {
  let elapsed = 0;
  for (let current = 1; current < period; current += 1) {
    elapsed += periodLengthSeconds(current, regulationMinutes);
  }
  const periodLength = periodLengthSeconds(period, regulationMinutes);
  const remaining = Math.min(parseClockToSeconds(clock), periodLength);
  return elapsed + Math.max(0, periodLength - remaining);
}

function periodLabel(period: number) {
  if (period <= 4) return `Q${period}`;
  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? "OT" : `${overtimeNumber}OT`;
}

function normalizePointBoundary(
  period: number,
  clock: unknown,
  regulationMinutes = 12,
  boundary: "instant" | "start" | "end" = "instant",
) {
  const normalizedClock = normalizeClock(clock) || "0:00";
  if (boundary !== "start" || parseClockToSeconds(normalizedClock) !== 0) {
    return { period, clock: normalizedClock };
  }
  return {
    period: period + 1,
    clock: formatSecondsClock(periodLengthSeconds(period + 1, regulationMinutes)),
  };
}

function formatPointLabel(
  period: number,
  clock: unknown,
  regulationMinutes = 12,
  boundary: "instant" | "start" | "end" = "instant",
) {
  const normalized = normalizePointBoundary(period, clock, regulationMinutes, boundary);
  return `${periodLabel(normalized.period)} ${normalized.clock}`;
}

function formatSecondsClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function elapsedSecondsToPoint(elapsed: number, regulationMinutes = 12) {
  let remainingElapsed = Math.max(0, elapsed);
  let period = 1;
  while (remainingElapsed > periodLengthSeconds(period, regulationMinutes)) {
    remainingElapsed -= periodLengthSeconds(period, regulationMinutes);
    period += 1;
  }
  const remainingClock = Math.max(0, periodLengthSeconds(period, regulationMinutes) - remainingElapsed);
  return {
    period,
    clock: formatSecondsClock(remainingClock),
  };
}

function formatSignedValue(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function teamLabel(team: Record<string, unknown> | null | undefined) {
  return String(team?.teamTricode || team?.teamName || "Team");
}

function readableStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (/[\p{L}\p{N}]/u.test(text)) return text;
  }
  return "";
}

function playerDisplayName(player: Record<string, unknown>) {
  const firstName = String(player?.firstName || "").trim();
  const familyName = String(player?.familyName || player?.lastName || "").trim();
  const fullName = `${firstName} ${familyName}`.trim();
  return readableStringValue(
    player?.fullName,
    player?.playerName,
    player?.name,
    fullName,
    player?.nameI,
  );
}

function describeLineup(players: Array<Record<string, unknown>>) {
  return (Array.isArray(players) ? players : [])
    .map((player) => playerDisplayName(player))
    .filter(Boolean)
    .join(", ");
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function stableDigest(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeCacheRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const segmentKey = String(row.segmentKey || "").trim();
  if (!/^[a-z0-9-]{1,40}$/i.test(segmentKey)) return null;
  return {
    segmentKey,
    segmentLabel: String(row.segmentLabel || segmentKey).trim() || segmentKey,
  };
}

async function listCachedSegments(gameId: string, requesterIsAdmin = false) {
  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from(CACHE_TABLE)
    .select("game_id,segment_key,segment_label,range_label,result,data_signature,source,generated_at,updated_at")
    .eq("game_id", gameId)
    .order("generated_at", { ascending: true });

  if (error) {
    console.error("Unable to list cached game analyses.", error);
    throw new Error("Unable to load shared analysis recaps.");
  }

  return (Array.isArray(data) ? data : []).map((row) => {
    const record: Record<string, unknown> = {
      gameId: row.game_id,
      segmentKey: row.segment_key,
      segmentLabel: row.segment_label,
      rangeLabel: row.range_label,
      analysisResult: stripAdminOnlyAnalysisMetadata(row.result || {}, requesterIsAdmin),
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
    };
    if (requesterIsAdmin) {
      record.dataSignature = row.data_signature;
      record.source = row.source;
    }
    return record;
  });
}

async function readCachedSegment(gameId: string, segmentKey: string, dataSignature: string, requesterIsAdmin = false) {
  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from(CACHE_TABLE)
    .select("game_id,segment_key,segment_label,range_label,result,data_signature,source,generated_at,updated_at")
    .eq("game_id", gameId)
    .eq("segment_key", segmentKey)
    .maybeSingle();

  if (error) {
    console.error("Unable to read cached game analysis.", error);
    throw new Error("Unable to read shared analysis recap.");
  }
  if (!data || data.data_signature !== dataSignature || !data.result) return null;

  return stripAdminOnlyAnalysisMetadata({
    ...data.result,
    cached: true,
    cache: {
      segmentKey: data.segment_key,
      segmentLabel: data.segment_label,
      generatedAt: data.generated_at,
      updatedAt: data.updated_at,
      dataSignature: data.data_signature,
    },
  }, requesterIsAdmin);
}

async function writeCachedSegment({
  gameId,
  segmentKey,
  segmentLabel,
  rangeLabel,
  dataSignature,
  result,
}: {
  gameId: string;
  segmentKey: string;
  segmentLabel: string;
  rangeLabel: string;
  dataSignature: string;
  result: Record<string, unknown>;
}) {
  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from(CACHE_TABLE)
    .upsert({
      game_id: gameId,
      segment_key: segmentKey,
      segment_label: segmentLabel,
      range_label: rangeLabel,
      data_signature: dataSignature,
      result,
      source: String(result.source || "unknown"),
      generated_at: new Date().toISOString(),
    }, {
      onConflict: "game_id,segment_key",
    })
    .select("game_id,segment_key,segment_label,range_label,result,data_signature,source,generated_at,updated_at")
    .single();

  if (error) {
    console.error("Unable to write cached game analysis.", error);
    throw new Error("Unable to save shared analysis recap.");
  }

  return data;
}

function actionChronologyValue(action: Record<string, unknown>, regulationMinutes = 12) {
  const period = safeNumber(action.period, 0);
  const elapsed = pointToElapsedSeconds(period, action.clock, regulationMinutes);
  const order = safeNumber(action.orderNumber ?? action.actionNumber, 0);
  return { period, elapsed, order };
}

function sortActions(actions: Array<Record<string, unknown>>, regulationMinutes = 12) {
  return [...actions].sort((a, b) => {
    const aValue = actionChronologyValue(a, regulationMinutes);
    const bValue = actionChronologyValue(b, regulationMinutes);
    if (aValue.elapsed !== bValue.elapsed) return aValue.elapsed - bValue.elapsed;
    return aValue.order - bValue.order;
  });
}

function numericScore(action: Record<string, unknown>, side: "home" | "away") {
  return safeNumber(side === "home" ? action.scoreHome : action.scoreAway, 0);
}

function buildScoringEvents(actions: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string, regulationMinutes = 12) {
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
      elapsed: pointToElapsedSeconds(safeNumber(action.period, 0), action.clock, regulationMinutes),
      teamId: scoringTeamId,
      points,
      description: String(action.description || action.actionType || "").trim(),
      scoreHome: nextHome,
      scoreAway: nextAway,
    }];
  });
}

function findScoreAtOrBefore(actions: Array<Record<string, unknown>>, elapsed: number, regulationMinutes = 12) {
  let home = 0;
  let away = 0;
  for (const action of actions) {
    const actionElapsed = pointToElapsedSeconds(safeNumber(action.period, 0), action.clock, regulationMinutes);
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
  if (!attempted) return null;
  return Number(((made / attempted) * 100).toFixed(1));
}

function formatPercentage(value: unknown) {
  return value == null ? "N/A" : `${value}%`;
}

function formatPercentageWithAttempts(value: unknown, made: number, attempted: number) {
  return value == null ? "N/A" : `${value}% (${made}/${attempted})`;
}

function formatStatCount(value: number, singularLabel: string, pluralLabel = singularLabel) {
  const numeric = safeNumber(value, 0);
  return `${numeric} ${numeric === 1 ? singularLabel : pluralLabel}`;
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

function buildPlayerTotals(teamId: string, personId: string, name: string) {
  return {
    teamId,
    personId,
    name,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    reboundsTotal: 0,
    reboundsOffensive: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    foulsPersonal: 0,
  };
}

function getActionPlayerIdentity(action: Record<string, unknown>) {
  const personId = String(
    action.personId ||
    action.playerId ||
    action.person_id ||
    action.player_id ||
    "",
  ).trim();
  const name = String(
    action.fullName ||
    action.playerName ||
    action.playerNameI ||
    action.nameI ||
    action.player ||
    "",
  ).trim();
  if (!personId && !name) return null;
  return {
    personId: personId || name.toLowerCase().replace(/\s+/g, "-"),
    name: name || "Unknown",
  };
}

function buildPlayerRangeStats(
  rangeActions: Array<Record<string, unknown>>,
  scoringEvents: Array<Record<string, unknown>>,
) {
  const playerTotals = new Map<string, ReturnType<typeof buildPlayerTotals>>();
  const scoringByActionNumber = new Map<number, number>();

  scoringEvents.forEach((event) => {
    scoringByActionNumber.set(safeNumber(event.actionNumber, 0), safeNumber(event.points, 0));
  });

  const upsertPlayer = (action: Record<string, unknown>) => {
    const teamId = String(action.teamId || "").trim();
    const identity = getActionPlayerIdentity(action);
    if (!teamId || !identity) return null;
    const key = `${teamId}:${identity.personId}`;
    if (!playerTotals.has(key)) {
      playerTotals.set(key, buildPlayerTotals(teamId, identity.personId, identity.name));
    }
    return playerTotals.get(key)!;
  };

  for (const action of rangeActions) {
    const actionType = String(action.actionType || "").toLowerCase();
    const player = upsertPlayer(action);
    if (!player) continue;
    const points = scoringByActionNumber.get(safeNumber(action.actionNumber, 0)) || 0;
    const made = points > 0 || String(action.shotResult || "").toLowerCase() === "made";

    if (actionType === "2pt" || actionType === "3pt") {
      player.fieldGoalsAttempted += 1;
      if (actionType === "3pt") player.threePointersAttempted += 1;
      if (made) {
        player.points += points;
        player.fieldGoalsMade += 1;
        if (actionType === "3pt") player.threePointersMade += 1;
      }
    }

    if (actionType === "freethrow") {
      player.freeThrowsAttempted += 1;
      if (made) {
        player.freeThrowsMade += 1;
        player.points += points || 1;
      }
    }

    if (actionType === "rebound") {
      player.reboundsTotal += 1;
      const subType = String(action.subType || "").toLowerCase();
      if (subType.includes("offensive")) player.reboundsOffensive += 1;
    }

    if (actionType === "assist") player.assists += 1;
    if (actionType === "steal") player.steals += 1;
    if (actionType === "block") player.blocks += 1;
    if (actionType === "turnover") player.turnovers += 1;
    if (actionType === "foul" && isPersonalFoul(action)) player.foulsPersonal += 1;
  }

  return [...playerTotals.values()];
}

function buildPlayerInsights(
  playerTotals: Array<ReturnType<typeof buildPlayerTotals>>,
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
  homePoints: number,
  awayPoints: number,
) {
  const teamPointsById: Record<string, number> = {
    [String(homeTeam.teamId || "")]: homePoints,
    [String(awayTeam.teamId || "")]: awayPoints,
  };
  const teamLookup: Record<string, Record<string, unknown>> = {
    [String(homeTeam.teamId || "")]: homeTeam,
    [String(awayTeam.teamId || "")]: awayTeam,
  };

  const featured = Object.keys(teamPointsById)
    .map((teamId) => {
      const teamPlayers = playerTotals
        .filter((entry) => entry.teamId === teamId)
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.assists !== a.assists) return b.assists - a.assists;
          return b.reboundsTotal - a.reboundsTotal;
        });
      const leader = teamPlayers[0] || null;
      if (!leader) return null;
      const teamPoints = Math.max(0, teamPointsById[teamId] || 0);
      const pointShare = teamPoints > 0 ? leader.points / teamPoints : 0;
      const statBits = [];
      if (leader.assists >= 3) statBits.push(formatStatCount(leader.assists, "Ast"));
      if (leader.reboundsTotal >= 4) statBits.push(formatStatCount(leader.reboundsTotal, "Reb"));
      if (leader.steals >= 2) statBits.push(formatStatCount(leader.steals, "Stl"));
      if (leader.blocks >= 2) statBits.push(formatStatCount(leader.blocks, "Blk"));

      const noteStrength = (leader.points * 3) + (pointShare * 10) + leader.assists + leader.reboundsTotal;
      if (leader.points < 6 && !statBits.length) return null;

      const detail = statBits.length ? ` with ${statBits.join(", ")}` : "";
      const shareText = teamPoints > 0 && (pointShare >= 0.4 || leader.points >= 10)
        ? `, accounting for ${formatStatCount(leader.points, "Pt", "Pts")} of ${teamLabel(teamLookup[teamId])}'s ${formatStatCount(teamPoints, "Pt", "Pts")}`
        : "";

      return {
        strength: noteStrength,
        note: `${teamLabel(teamLookup[teamId])} player note: ${leader.name} had ${formatStatCount(leader.points, "Pt", "Pts")}${detail}${shareText}.`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.strength - a!.strength)
    .map((entry) => entry!.note);

  const negativeNotes = playerTotals
    .filter((entry) => entry.turnovers >= 3 || entry.foulsPersonal >= 4)
    .sort((a, b) => ((b.turnovers + b.foulsPersonal) - (a.turnovers + a.foulsPersonal)))
    .slice(0, 1)
    .map((entry) => {
      const team = teamLookup[entry.teamId];
      const parts = [];
      if (entry.turnovers >= 3) parts.push(`${entry.turnovers} TO`);
      if (entry.foulsPersonal >= 4) parts.push(`${entry.foulsPersonal} PF`);
      return `${teamLabel(team)} caution: ${entry.name} finished this span with ${parts.join(" and ")}.`;
    });

  return [...featured, ...negativeNotes].slice(0, 3);
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

function buildRunSummary(
  scoringEvents: Array<Record<string, unknown>>,
  homeTeamId: string,
  awayTeamId: string,
  regulationMinutes = 12,
) {
  const bestByTeam: Record<string, { points: number; startLabel: string; endLabel: string } | null> = {
    [homeTeamId]: null,
    [awayTeamId]: null,
  };

  let currentTeamId = "";
  let currentPoints = 0;
  let currentStartLabel = "";

  for (const event of scoringEvents) {
    const teamId = String(event.teamId || "");
    const label = formatPointLabel(safeNumber(event.period, 0), event.clock, regulationMinutes, "end");
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

function buildScoreTimeline(
  scoringEvents: Array<Record<string, unknown>>,
  rangeStartElapsed: number,
  startScore: { home: number; away: number },
  homeTeamId: string,
  awayTeamId: string,
  regulationMinutes = 12,
) {
  const startPoint = elapsedSecondsToPoint(rangeStartElapsed, regulationMinutes);
  const timeline = [{
    elapsed: rangeStartElapsed,
    period: startPoint.period,
    clock: startPoint.clock,
    scoreHome: startScore.home,
    scoreAway: startScore.away,
  }];

  scoringEvents.forEach((event) => {
    timeline.push({
      elapsed: safeNumber(event.elapsed, 0),
      period: safeNumber(event.period, 0),
      clock: String(event.clock || "0:00"),
      scoreHome: safeNumber(event.scoreHome, 0),
      scoreAway: safeNumber(event.scoreAway, 0),
    });
  });

  return timeline.map((entry) => {
    const margin = entry.scoreHome - entry.scoreAway;
    return {
      ...entry,
      leaderId: margin > 0 ? homeTeamId : margin < 0 ? awayTeamId : "",
      margin,
    label: formatPointLabel(entry.period, entry.clock, regulationMinutes, "end"),
    };
  });
}

function buildGameFlowContext(
  timeline: Array<{
    elapsed: number;
    period: number;
    clock: string;
    scoreHome: number;
    scoreAway: number;
    leaderId: string;
    margin: number;
    label: string;
  }>,
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
) {
  const homeTeamId = String(homeTeam.teamId || "");
  const awayTeamId = String(awayTeam.teamId || "");
  const largestLead = {
    [homeTeamId]: { points: 0, label: "" },
    [awayTeamId]: { points: 0, label: "" },
  };

  let leadChanges = 0;
  let tieMoments = 0;
  let lastNonTieLeader = timeline[0]?.leaderId || "";
  let previousMargin = timeline[0]?.margin || 0;

  timeline.forEach((entry, index) => {
    const homeLead = entry.scoreHome - entry.scoreAway;
    const awayLead = -homeLead;
    if (homeLead > largestLead[homeTeamId].points) {
      largestLead[homeTeamId] = { points: homeLead, label: entry.label };
    }
    if (awayLead > largestLead[awayTeamId].points) {
      largestLead[awayTeamId] = { points: awayLead, label: entry.label };
    }

    if (index === 0) return;

    if (entry.margin === 0 && previousMargin !== 0) {
      tieMoments += 1;
    }
    if (entry.leaderId && lastNonTieLeader && entry.leaderId !== lastNonTieLeader) {
      leadChanges += 1;
    }
    if (entry.leaderId) {
      lastNonTieLeader = entry.leaderId;
    }
    previousMargin = entry.margin;
  });

  const homeLargest = largestLead[homeTeamId];
  const awayLargest = largestLead[awayTeamId];
  let shape = "steady";
  let items = [
    `${formatLargestLeadItem(homeTeam, homeLargest)} ${formatLargestLeadItem(awayTeam, awayLargest)}`,
  ];

  if (leadChanges >= 3 || (tieMoments >= 2 && homeLargest.points >= 4 && awayLargest.points >= 4)) {
    shape = "volatile";
    items = [
      `The stretch swung repeatedly with ${leadChanges} lead change${leadChanges === 1 ? "" : "s"} and ${tieMoments} tie${tieMoments === 1 ? "" : "s"}.`,
      `${teamLabel(homeTeam)} led by as many as ${homeLargest.points}; ${teamLabel(awayTeam)} led by as many as ${awayLargest.points}.`,
    ];
  } else if (homeLargest.points >= 8 || awayLargest.points >= 8) {
    shape = "control";
    const controllingTeam = homeLargest.points >= awayLargest.points ? homeTeam : awayTeam;
    const controllingLead = Math.max(homeLargest.points, awayLargest.points);
    items = [
      `${teamLabel(controllingTeam)} created the clearest separation, building a ${controllingLead}-point cushion in this span.`,
      `${formatLargestLeadItem(homeTeam, homeLargest)} ${formatLargestLeadItem(awayTeam, awayLargest)}`,
    ];
  }

  return {
    shape,
    leadChanges,
    ties: tieMoments,
    largestLead,
    items,
    strength: leadChanges >= 3 ? leadChanges + tieMoments : Math.max(homeLargest.points, awayLargest.points) * 0.6,
  };
}

function buildMomentumBursts(
  scoringEvents: Array<Record<string, unknown>>,
  rangeStartScore: { home: number; away: number },
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
  regulationMinutes = 12,
) {
  const homeTeamId = String(homeTeam.teamId || "");
  const awayTeamId = String(awayTeam.teamId || "");
  const teamIds = [homeTeamId, awayTeamId];
  const bestByTeam: Record<string, null | {
    teamId: string;
    points: number;
    opponentPoints: number;
    net: number;
    startElapsed: number;
    endElapsed: number;
    startLabel: string;
    endLabel: string;
    startMargin: number;
    endMargin: number;
  }> = {
    [homeTeamId]: null,
    [awayTeamId]: null,
  };

  for (const teamId of teamIds) {
    for (let index = 0; index < scoringEvents.length; index += 1) {
      const startEvent = scoringEvents[index];
      const startElapsed = safeNumber(startEvent.elapsed, 0);
      let teamPoints = 0;
      let opponentPoints = 0;

      for (let nextIndex = index; nextIndex < scoringEvents.length; nextIndex += 1) {
        const nextEvent = scoringEvents[nextIndex];
        const elapsedDelta = safeNumber(nextEvent.elapsed, 0) - startElapsed;
        if (elapsedDelta > 150) break;

        if (String(nextEvent.teamId || "") === teamId) {
          teamPoints += safeNumber(nextEvent.points, 0);
        } else {
          opponentPoints += safeNumber(nextEvent.points, 0);
        }

        const net = teamPoints - opponentPoints;
        if (teamPoints < 6 || net < 5) continue;

        const previousBest = bestByTeam[teamId];
        if (!previousBest || net > previousBest.net || (net === previousBest.net && teamPoints > previousBest.points)) {
          const previousEvent = index > 0 ? scoringEvents[index - 1] : null;
          const startScore = previousEvent
            ? { home: safeNumber(previousEvent.scoreHome, rangeStartScore.home), away: safeNumber(previousEvent.scoreAway, rangeStartScore.away) }
            : rangeStartScore;
          const endScore = {
            home: safeNumber(nextEvent.scoreHome, rangeStartScore.home),
            away: safeNumber(nextEvent.scoreAway, rangeStartScore.away),
          };
          bestByTeam[teamId] = {
            teamId,
            points: teamPoints,
            opponentPoints,
            net,
            startElapsed,
            endElapsed: safeNumber(nextEvent.elapsed, 0),
            startLabel: formatPointLabel(safeNumber(startEvent.period, 0), startEvent.clock, regulationMinutes, "start"),
            endLabel: formatPointLabel(safeNumber(nextEvent.period, 0), nextEvent.clock, regulationMinutes, "end"),
            startMargin: scoreMarginForTeam(startScore, teamId, homeTeamId, awayTeamId),
            endMargin: scoreMarginForTeam(endScore, teamId, homeTeamId, awayTeamId),
          };
        }
      }
    }
  }

  const burstSummaries = teamIds
    .map((teamId) => bestByTeam[teamId])
    .filter(Boolean)
    .map((burst) => ({
      ...burst!,
      team: burst!.teamId === homeTeamId ? teamLabel(homeTeam) : teamLabel(awayTeam),
      items: [
        `${burst!.teamId === homeTeamId ? teamLabel(homeTeam) : teamLabel(awayTeam)}'s best push was ${burst!.points}-${burst!.opponentPoints} from ${burst!.startLabel} to ${burst!.endLabel}.`,
        `That stretch changed the margin for ${burst!.teamId === homeTeamId ? teamLabel(homeTeam) : teamLabel(awayTeam)} from ${describeMarginState(burst!.startMargin)} to ${describeMarginState(burst!.endMargin)}.`,
      ],
      strength: burst!.net,
    }));

  if (burstSummaries.length <= 1) return burstSummaries;

  const chronologicalItems = [...burstSummaries]
    .sort((a, b) => a.startElapsed - b.startElapsed || b.net - a.net)
    .map((burst, index) => {
      const sequenceLabel = index === 0 ? "first major push" : "next major push";
      return `${burst.team}'s ${sequenceLabel} was ${burst.points}-${burst.opponentPoints} from ${burst.startLabel} to ${burst.endLabel}, ${describeMarginMovement(burst.startMargin, burst.endMargin)}.`;
    });

  const strongestBurst = [...burstSummaries]
    .sort((a, b) => b.net - a.net || b.points - a.points)[0];

  return [{
    ...strongestBurst,
    items: chronologicalItems,
    strength: strongestBurst.strength,
  }];
}

function scoreForTeam(score: { home: number; away: number }, teamId: string, homeTeamId: string, awayTeamId: string) {
  if (teamId === homeTeamId) return score.home;
  if (teamId === awayTeamId) return score.away;
  return 0;
}

function opponentTeamId(teamId: string, homeTeamId: string, awayTeamId: string) {
  return teamId === homeTeamId ? awayTeamId : homeTeamId;
}

function scoreMarginForTeam(score: { home: number; away: number }, teamId: string, homeTeamId: string, awayTeamId: string) {
  const teamScore = scoreForTeam(score, teamId, homeTeamId, awayTeamId);
  const opponentScore = scoreForTeam(score, opponentTeamId(teamId, homeTeamId, awayTeamId), homeTeamId, awayTeamId);
  return teamScore - opponentScore;
}

function describeMarginState(margin: number) {
  if (margin > 0) return `a ${margin}-point lead`;
  if (margin < 0) return `a ${Math.abs(margin)}-point deficit`;
  return "a tie";
}

function describeMarginMovement(startMargin: number, endMargin: number) {
  if (startMargin === endMargin) return `leaving the margin at ${describeMarginState(endMargin)}`;
  if (startMargin < 0 && endMargin < 0) {
    const verb = Math.abs(endMargin) < Math.abs(startMargin) ? "cutting" : "deepening";
    return `${verb} ${describeMarginState(startMargin)} to ${describeMarginState(endMargin)}`;
  }
  if (startMargin < 0 && endMargin === 0) {
    return `erasing ${describeMarginState(startMargin)} to tie the game`;
  }
  if (startMargin < 0 && endMargin > 0) {
    return `turning ${describeMarginState(startMargin)} into ${describeMarginState(endMargin)}`;
  }
  if (startMargin === 0 && endMargin > 0) {
    return `breaking a tie to take ${describeMarginState(endMargin)}`;
  }
  if (startMargin === 0 && endMargin < 0) {
    return `falling from a tie into ${describeMarginState(endMargin)}`;
  }
  if (startMargin > 0 && endMargin > 0) {
    const verb = endMargin > startMargin ? "stretching" : "trimming";
    return `${verb} ${describeMarginState(startMargin)} to ${describeMarginState(endMargin)}`;
  }
  if (startMargin > 0 && endMargin === 0) {
    return `losing ${describeMarginState(startMargin)} and ending tied`;
  }
  return `swinging from ${describeMarginState(startMargin)} to ${describeMarginState(endMargin)}`;
}

function formatLargestLeadItem(team: Record<string, unknown>, lead: { points: number; label?: string }) {
  const teamName = teamLabel(team);
  const points = safeNumber(lead?.points, 0);
  if (points <= 0) return `${teamName} never led during this span.`;
  return `${teamName}'s largest lead was ${points} at ${lead?.label || "the start of the span"}.`;
}

function buildLateSwingInsight(
  actions: Array<Record<string, unknown>>,
  scoringEvents: Array<Record<string, unknown>>,
  rangeStartElapsed: number,
  rangeEndElapsed: number,
  maxPeriod: number,
  maxClock: string,
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
  regulationMinutes = 12,
) {
  const maxClockSeconds = parseClockToSeconds(maxClock);
  const nearPeriodEnd = maxClockSeconds <= 2;
  if (!nearPeriodEnd) return null;

  const homeTeamId = String(homeTeam.teamId || "");
  const awayTeamId = String(awayTeam.teamId || "");
  if (!homeTeamId || !awayTeamId) return null;

  const lateWindowSeconds = 120;
  const lateWindowStart = Math.max(rangeStartElapsed, rangeEndElapsed - lateWindowSeconds);
  if ((rangeEndElapsed - lateWindowStart) < 20) return null;

  const startScore = findScoreAtOrBefore(actions, lateWindowStart, regulationMinutes);
  const endScore = findScoreAtOrBefore(actions, rangeEndElapsed, regulationMinutes);
  const endEvents = scoringEvents.filter((event) => {
    const elapsed = safeNumber(event.elapsed, 0);
    return elapsed >= lateWindowStart && elapsed <= rangeEndElapsed;
  });
  if (!endEvents.length) return null;

  const scoreMoments = [
    (() => {
      const point = elapsedSecondsToPoint(lateWindowStart, regulationMinutes);
      return {
        elapsed: lateWindowStart,
        period: point.period,
        clock: point.clock,
        scoreHome: startScore.home,
        scoreAway: startScore.away,
      };
    })(),
    ...endEvents.map((event) => ({
      elapsed: safeNumber(event.elapsed, 0),
      period: safeNumber(event.period, maxPeriod),
      clock: String(event.clock || "0:00"),
      scoreHome: safeNumber(event.scoreHome, 0),
      scoreAway: safeNumber(event.scoreAway, 0),
    })),
  ];

  const finalMargins = {
    [homeTeamId]: endScore.home - endScore.away,
    [awayTeamId]: endScore.away - endScore.home,
  };
  const teamLookup: Record<string, Record<string, unknown>> = {
    [homeTeamId]: homeTeam,
    [awayTeamId]: awayTeam,
  };

  let bestCandidate: null | {
    type: "collapse" | "comeback";
    teamId: string;
    opponentId: string;
    peakLead: number;
    peakLabel: string;
    peakElapsed: number;
    finalMargin: number;
    strength: number;
  } = null;

  const teamIds = [homeTeamId, awayTeamId];

  for (const moment of scoreMoments) {
    for (const teamId of teamIds) {
      const opponentId = opponentTeamId(teamId, homeTeamId, awayTeamId);
      const teamScore = scoreForTeam(
        { home: moment.scoreHome, away: moment.scoreAway },
        teamId,
        homeTeamId,
        awayTeamId,
      );
      const opponentScore = scoreForTeam(
        { home: moment.scoreHome, away: moment.scoreAway },
        opponentId,
        homeTeamId,
        awayTeamId,
      );
      const lead = teamScore - opponentScore;
      const deficit = opponentScore - teamScore;
      const finalMargin = finalMargins[teamId];
      const timeLeft = Math.max(0, rangeEndElapsed - moment.elapsed);
      const collapse = lead >= 4 && finalMargin <= 0;
      const comeback = deficit >= 4 && finalMargin >= 0;
      if (!collapse && !comeback) continue;

      const type = collapse ? "collapse" : "comeback";
      const peakLead = collapse ? lead : deficit;
      const urgencyBoost = Math.max(0, 90 - timeLeft) / 15;
      const reversalBoost = Math.abs(finalMargin) + (finalMargin === 0 ? 1.5 : 0);
      const strength = (peakLead * 2.5) + urgencyBoost + reversalBoost;
      if (!bestCandidate || strength > bestCandidate.strength) {
        bestCandidate = {
          type,
          teamId,
          opponentId,
          peakLead,
          peakLabel: formatPointLabel(moment.period, moment.clock, regulationMinutes, "end"),
          peakElapsed: moment.elapsed,
          finalMargin,
          strength,
        };
      }
    }
  }

  if (!bestCandidate) return null;

  const closingScores = endEvents.filter((event) => safeNumber(event.elapsed, 0) >= bestCandidate.peakElapsed);
  const scoringTeamId = bestCandidate.type === "collapse" ? bestCandidate.opponentId : bestCandidate.teamId;
  const scoringTeamPoints = closingScores
    .filter((event) => String(event.teamId || "") === scoringTeamId)
    .reduce((sum, event) => sum + safeNumber(event.points, 0), 0);
  const otherTeamPoints = closingScores
    .filter((event) => String(event.teamId || "") !== scoringTeamId)
    .reduce((sum, event) => sum + safeNumber(event.points, 0), 0);

  const team = teamLookup[bestCandidate.teamId];
  const opponent = teamLookup[bestCandidate.opponentId];
  const title = bestCandidate.type === "collapse" ? "Late Collapse" : "Late Comeback";
  const closingRunText = `${scoringTeamPoints}-${otherTeamPoints}`;
  const finalText = bestCandidate.finalMargin === 0
    ? "ending the selected span tied"
    : `${bestCandidate.finalMargin > 0 ? "finishing the selected span ahead" : "finishing the selected span down"} by ${Math.abs(bestCandidate.finalMargin)}`;

  return {
    title,
    strength: bestCandidate.strength,
    type: bestCandidate.type,
    team: teamLabel(team),
    opponent: teamLabel(opponent),
    peakLead: bestCandidate.peakLead,
    peakLabel: bestCandidate.peakLabel,
    finalMargin: bestCandidate.finalMargin,
    closingRun: {
      team: teamLabel(scoringTeamId === homeTeamId ? homeTeam : awayTeam),
      points: scoringTeamPoints,
      opponentPoints: otherTeamPoints,
    },
    items: bestCandidate.type === "collapse"
      ? [
        `${teamLabel(team)} led by ${bestCandidate.peakLead} at ${bestCandidate.peakLabel}, but ${teamLabel(opponent)} closed on a ${closingRunText} run from that point.`,
        `${teamLabel(team)} went from leading by ${bestCandidate.peakLead} to ${finalText}.`,
      ]
      : [
        `${teamLabel(team)} erased a ${bestCandidate.peakLead}-point deficit after ${bestCandidate.peakLabel} by closing on a ${closingRunText} run.`,
        `${teamLabel(team)} went from down ${bestCandidate.peakLead} to ${finalText}.`,
      ],
  };
}

function buildLineupInsights(
  minutesData: Record<string, unknown> | null,
  rangeStartElapsed: number,
  rangeEndElapsed: number,
  homeTeam: Record<string, unknown>,
  awayTeam: Record<string, unknown>,
  homeMargin: number,
  awayMargin: number,
  regulationMinutes = 12,
) {
  const rangeSeconds = Math.max(1, rangeEndElapsed - rangeStartElapsed);
  const lineupAggregates = new Map<string, {
    teamId: string;
    seconds: number;
    margin: number;
    players: string;
    stintCount: number;
  }>();
  const playerSplits = new Map<string, {
    teamId: string;
    name: string;
    onSeconds: number;
    onMargin: number;
  }>();

  const upsertPlayer = (teamId: string, player: Record<string, unknown>, margin: number, seconds: number) => {
    const personId = String(player?.personId || "");
    const name = playerDisplayName(player);
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

  const lineupKey = (players: Array<Record<string, unknown>>) => {
    const keys = (Array.isArray(players) ? players : [])
      .map((player) => readableStringValue(player?.personId, player?.playerId, playerDisplayName(player)))
      .filter(Boolean)
      .sort();
    return keys.length ? keys.join("|") : "";
  };

  const upsertLineup = (
    teamId: string,
    players: Array<Record<string, unknown>>,
    margin: number,
    seconds: number,
  ) => {
    if (!teamId || seconds <= 0) return;
    const key = lineupKey(players);
    const label = describeLineup(players);
    if (!key || !label) return;
    const aggregateKey = `${teamId}:${key}`;
    if (!lineupAggregates.has(aggregateKey)) {
      lineupAggregates.set(aggregateKey, {
        teamId,
        seconds: 0,
        margin: 0,
        players: label,
        stintCount: 0,
      });
    }
    const entry = lineupAggregates.get(aggregateKey)!;
    entry.seconds += seconds;
    entry.margin += margin;
    entry.stintCount += 1;
  };

  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods : [];
  for (const periodRow of periods) {
    const period = safeNumber(periodRow?.period, 0);
    const stints = Array.isArray(periodRow?.stints) ? periodRow.stints : [];
    for (const stint of stints) {
      const stintStart = pointToElapsedSeconds(period, stint.startClock, regulationMinutes);
      const stintEnd = pointToElapsedSeconds(period, stint.endClock, regulationMinutes);
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

      upsertLineup(String(homeTeam.teamId), homePlayers, weightedHomeMargin, overlapSeconds);
      upsertLineup(String(awayTeam.teamId), awayPlayers, weightedAwayMargin, overlapSeconds);

      homePlayers.forEach((player) => upsertPlayer(String(homeTeam.teamId), player, weightedHomeMargin, overlapSeconds));
      awayPlayers.forEach((player) => upsertPlayer(String(awayTeam.teamId), player, weightedAwayMargin, overlapSeconds));
    }
  }

  const topLineups = [String(homeTeam.teamId), String(awayTeam.teamId)]
    .map((teamId) => {
      const ranked = [...lineupAggregates.values()]
        .filter((entry) => entry.teamId === teamId && entry.seconds >= 60)
        .sort((a, b) => b.margin - a.margin || b.seconds - a.seconds);
      return ranked[0] || null;
    })
    .filter(Boolean)
    .map((entry) => {
      const team = String(entry!.teamId) === String(homeTeam.teamId) ? homeTeam : awayTeam;
      const stintDetail = entry!.stintCount > 1 ? ` across ${entry!.stintCount} stints` : "";
      return `${teamLabel(team)} best lineup: ${describeLineupString(entry!.players)} was ${formatSignedValue(Math.round(entry!.margin))} in ${formatSecondsClock(entry!.seconds)}${stintDetail}.`;
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
          return {
            ...entry,
            offSeconds,
            offMargin,
            differential: entry.onMargin - offMargin,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b!.differential) - Math.abs(a!.differential));
      return candidates[0] || null;
    })
    .filter(Boolean)
    .map((entry) => {
      const team = entry!.teamId === String(homeTeam.teamId) ? homeTeam : awayTeam;
      return `${teamLabel(team)} on/off: ${entry!.name} was ${formatSignedValue(Math.round(entry!.onMargin))} on court in ${formatSecondsClock(entry!.onSeconds)} versus ${formatSignedValue(Math.round(entry!.offMargin))} off court in ${formatSecondsClock(entry!.offSeconds)}.`;
    });

  return {
    lineupNotes: [...topLineups, ...playerNotes].slice(0, 4),
  };
}

function describeLineupString(players: string) {
  if (!players) return "That group";
  return players;
}

function buildDataQualityWarnings({
  rangeActions,
  scoringEvents,
  minutesData,
  homeTeamId,
  awayTeamId,
  rangeDurationSeconds,
}: {
  rangeActions: Array<Record<string, unknown>>;
  scoringEvents: Array<Record<string, unknown>>;
  minutesData: Record<string, unknown> | null;
  homeTeamId: string;
  awayTeamId: string;
  rangeDurationSeconds: number;
}) {
  const warnings = [];
  const shotActions = rangeActions.filter((action) => ["2pt", "3pt"].includes(String(action.actionType || "").toLowerCase()));
  const qualifiedShots = shotActions.filter((action) => normalizeQualifiers(action.qualifiers).length > 0);
  const hasLineupData = Array.isArray(minutesData?.periods) && minutesData.periods.length > 0;

  if (!homeTeamId || !awayTeamId) {
    warnings.push("Team identifiers are incomplete, so team attribution may be limited.");
  }
  if (!rangeActions.length) {
    warnings.push("No play-by-play actions were found in this selected range.");
  }
  if (!scoringEvents.length) {
    warnings.push("No scoring events were found in this selected range.");
  }
  if (!hasLineupData) {
    warnings.push("Lineup/minutes data is unavailable, so lineup notes may be omitted.");
  }
  if (shotActions.length > 0 && qualifiedShots.length === 0) {
    warnings.push("Shot-location and context tags are unavailable in this range, so paint/transition/second-chance notes may be limited.");
  }
  if (rangeDurationSeconds <= 60) {
    warnings.push("This is a short range, so small-sample swings may be noisy.");
  }

  return {
    warnings,
    actionCount: rangeActions.length,
    scoringEventCount: scoringEvents.length,
    shotActionCount: shotActions.length,
    qualifiedShotCount: qualifiedShots.length,
    hasLineupData,
  };
}

function leaderInfo(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const homeMargin = safeNumber(features.score.margin.home, 0);
  const leader = homeMargin >= 0 ? home : away;
  const trailer = homeMargin >= 0 ? away : home;
  const leaderPoints = homeMargin >= 0
    ? safeNumber(features.score.rangePoints.home, 0)
    : safeNumber(features.score.rangePoints.away, 0);
  const trailerPoints = homeMargin >= 0
    ? safeNumber(features.score.rangePoints.away, 0)
    : safeNumber(features.score.rangePoints.home, 0);
  return {
    homeMargin,
    margin: Math.abs(homeMargin),
    leader,
    trailer,
    leaderPoints,
    trailerPoints,
  };
}

function rangeContextLabel(features: ReturnType<typeof buildFeaturePayload>) {
  const startLabel = String(features.range.startLabel || "");
  const endLabel = String(features.range.endLabel || "");

  const singleQuarter = /^Q([1-4]) \d{1,2}:\d{2}$/.exec(startLabel);
  if (singleQuarter && endLabel === `Q${singleQuarter[1]} 0:00`) {
    return `Q${singleQuarter[1]}`;
  }

  if (/^Q1 \d{1,2}:\d{2}$/.test(startLabel) && endLabel === "Q2 0:00") return "the first half";
  if (/^Q3 \d{1,2}:\d{2}$/.test(startLabel) && endLabel === "Q4 0:00") return "the second half";
  if (/^Q1 \d{1,2}:\d{2}$/.test(startLabel) && endLabel === "Q3 0:00") return "the first three quarters";
  if (/^Q1 \d{1,2}:\d{2}$/.test(startLabel) && endLabel === "Q4 0:00") return "the full game";
  return "the selected span";
}

function formatScoreState(
  score: { home: number; away: number },
  features: ReturnType<typeof buildFeaturePayload>,
) {
  return `${features.teams.away.tricode} ${score.away}, ${features.teams.home.tricode} ${score.home}`;
}

function formatRangeScoringFacts(features: ReturnType<typeof buildFeaturePayload>) {
  return `${features.teams.away.tricode} ${features.score.rangePoints.away}, ${features.teams.home.tricode} ${features.score.rangePoints.home}`;
}

function buildFeaturePayload(
  game: Record<string, unknown>,
  minutesData: Record<string, unknown> | null,
  range: Record<string, unknown>,
) {
  const gameId = String(game.gameId || "");
  const regulationMinutes = inferRegulationMinutes(game, gameId);
  const homeTeam = (game.homeTeam || {}) as Record<string, unknown>;
  const awayTeam = (game.awayTeam || {}) as Record<string, unknown>;
  const homeTeamId = String(homeTeam.teamId || "");
  const awayTeamId = String(awayTeam.teamId || "");
  const actions = sortActions(Array.isArray(game.playByPlayActions) ? game.playByPlayActions : [], regulationMinutes);

  const minPeriod = safeNumber(range.minPeriod, 1);
  const maxPeriod = safeNumber(range.maxPeriod, 1);
  const minClock = String(range.minClock || `${regulationMinutes}:00`);
  const maxClock = String(range.maxClock || "0:00");
  const rangeStartElapsed = pointToElapsedSeconds(minPeriod, minClock, regulationMinutes);
  const rangeEndElapsed = pointToElapsedSeconds(maxPeriod, maxClock, regulationMinutes);
  const allowedMaxElapsed = game.gameStatus === 2
    ? pointToElapsedSeconds(safeNumber(game.period, maxPeriod), game.gameClock, regulationMinutes)
    : pointToElapsedSeconds(Math.max(1, safeNumber(game.period, maxPeriod)), "0:00", regulationMinutes);

  if (rangeEndElapsed > allowedMaxElapsed) {
    throw new Error(`Max time cannot be later than ${formatPointLabel(safeNumber(game.period, maxPeriod), game.gameClock || "0:00", regulationMinutes, "end")}.`);
  }

  if (rangeStartElapsed >= rangeEndElapsed) {
    throw new Error("Min time must be earlier than max time.");
  }

  const rangeActions = actions.filter((action) => {
    const elapsed = pointToElapsedSeconds(safeNumber(action.period, 0), action.clock, regulationMinutes);
    return elapsed >= rangeStartElapsed && elapsed <= rangeEndElapsed;
  });

  const allScoringEvents = buildScoringEvents(actions, homeTeamId, awayTeamId, regulationMinutes);
  const scoringEvents = allScoringEvents.filter((event) => event.elapsed >= rangeStartElapsed && event.elapsed <= rangeEndElapsed);
  const startScore = findScoreAtOrBefore(actions, rangeStartElapsed, regulationMinutes);
  const endScore = findScoreAtOrBefore(actions, rangeEndElapsed, regulationMinutes);
  const homePoints = endScore.home - startScore.home;
  const awayPoints = endScore.away - startScore.away;
  const homeMargin = homePoints - awayPoints;
  const awayMargin = -homeMargin;
  const rangeDurationSeconds = rangeEndElapsed - rangeStartElapsed;
  const scoreTimeline = buildScoreTimeline(scoringEvents, rangeStartElapsed, startScore, homeTeamId, awayTeamId, regulationMinutes);

  const totals = aggregateRangeStats(rangeActions, scoringEvents, homeTeamId, awayTeamId);
  const playerTotals = buildPlayerRangeStats(rangeActions, scoringEvents);
  const runs = buildRunSummary(scoringEvents, homeTeamId, awayTeamId, regulationMinutes);
  const gameFlow = buildGameFlowContext(scoreTimeline, homeTeam, awayTeam);
  const momentumBursts = buildMomentumBursts(scoringEvents, startScore, homeTeam, awayTeam, regulationMinutes);
  const lateSwing = buildLateSwingInsight(
    actions,
    scoringEvents,
    rangeStartElapsed,
    rangeEndElapsed,
    maxPeriod,
    maxClock,
    homeTeam,
    awayTeam,
    regulationMinutes,
  );
  const lineupInsights = buildLineupInsights(
    minutesData,
    rangeStartElapsed,
    rangeEndElapsed,
    homeTeam,
    awayTeam,
    homeMargin,
    awayMargin,
    regulationMinutes,
  );

  const homeTotals = totals[homeTeamId];
  const awayTotals = totals[awayTeamId];
  const playerNotes = buildPlayerInsights(
    playerTotals,
    homeTeam,
    awayTeam,
    homePoints,
    awayPoints,
  );
  const dataQuality = buildDataQualityWarnings({
    rangeActions,
    scoringEvents,
    minutesData,
    homeTeamId,
    awayTeamId,
    rangeDurationSeconds,
  });

  return {
    range: {
      startLabel: formatPointLabel(minPeriod, minClock, regulationMinutes, "start"),
      endLabel: formatPointLabel(maxPeriod, maxClock, regulationMinutes, "end"),
      duration: formatSecondsClock(rangeDurationSeconds),
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
    playerNotes,
    gameFlow,
    momentumBursts,
    lateSwing,
    lineupNotes: lineupInsights.lineupNotes,
    dataQuality,
  };
}

function buildInsightSignals(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const { leader, trailer, margin } = leaderInfo(features);
  const signals = [
    {
      key: "shape",
      title: "Game Flow",
      strength: Math.max(safeNumber(features.gameFlow?.strength, 0), margin * 0.7),
      items: [
        `${leader.tricode} won the stretch ${leaderPointsLabel(features)} over ${features.range.duration}; the score moved from ${features.score.start.away}-${features.score.start.home} to ${features.score.end.away}-${features.score.end.home}.`,
        ...(Array.isArray(features.gameFlow?.items) ? features.gameFlow.items : []),
      ],
    },
    {
      key: "burst",
      title: "Momentum Swing",
      strength: safeNumber(features.momentumBursts?.[0]?.strength, 0),
      items: Array.isArray(features.momentumBursts?.[0]?.items) ? features.momentumBursts[0].items : [],
    },
    {
      key: "lateSwing",
      title: features.lateSwing?.title || "Late Swing",
      strength: safeNumber(features.lateSwing?.strength, 0),
      items: Array.isArray(features.lateSwing?.items) ? features.lateSwing.items : [],
    },
    {
      key: "run",
      title: "Run",
      strength: Math.max(
        safeNumber(home.largestRun?.points, 0),
        safeNumber(away.largestRun?.points, 0),
      ),
      items: [home, away]
        .filter((team) => team.largestRun?.points)
        .sort((a, b) => safeNumber(b.largestRun?.points, 0) - safeNumber(a.largestRun?.points, 0))
        .slice(0, 1)
        .map((team) => `${team.tricode} had the biggest unanswered run at ${team.largestRun?.points}-0 from ${team.largestRun?.startLabel} to ${team.largestRun?.endLabel}.`),
    },
    {
      key: "turnovers",
      title: "Possession Battle",
      strength: Math.abs(home.totals.turnovers - away.totals.turnovers) * 1.2,
      items: [
        buildTurnoverText(home, away) || `${home.tricode} and ${away.tricode} committed ${home.totals.turnovers} turnovers each.`,
        `${home.tricode} points off turnovers: ${home.totals.pointsOffTurnovers}. ${away.tricode} points off turnovers: ${away.totals.pointsOffTurnovers}.`,
      ],
    },
    {
      key: "paint",
      title: "Shot Profile",
      strength: Math.abs(home.totals.paintPoints - away.totals.paintPoints),
      items: [
        `${home.tricode} paint points: ${home.totals.paintPoints}. ${away.tricode} paint points: ${away.totals.paintPoints}.`,
        `${home.tricode} rim scoring was ${home.totals.rimFieldGoalsMade}/${home.totals.rimFieldGoalsAttempted}; ${away.tricode} was ${away.totals.rimFieldGoalsMade}/${away.totals.rimFieldGoalsAttempted}.`,
      ],
    },
    {
      key: "transition",
      title: "Transition",
      strength: Math.abs(home.totals.transitionPoints - away.totals.transitionPoints),
      items: [
        `${home.tricode} transition points: ${home.totals.transitionPoints}. ${away.tricode} transition points: ${away.totals.transitionPoints}.`,
        `${home.tricode} second-chance points: ${home.totals.secondChancePoints}. ${away.tricode} second-chance points: ${away.totals.secondChancePoints}.`,
      ],
    },
    {
      key: "shooting",
      title: "Shooting",
      strength: Math.abs(safeNumber(home.shooting.fgPct, 0) - safeNumber(away.shooting.fgPct, 0)) + (margin * 0.5),
      items: [
        `${home.tricode} shot ${formatPercentageWithAttempts(home.shooting.fgPct, home.totals.fieldGoalsMade, home.totals.fieldGoalsAttempted)} versus ${away.tricode} at ${formatPercentageWithAttempts(away.shooting.fgPct, away.totals.fieldGoalsMade, away.totals.fieldGoalsAttempted)}.`,
        `${home.tricode} from three: ${formatPercentageWithAttempts(home.shooting.threePct, home.totals.threePointersMade, home.totals.threePointersAttempted)}; ${away.tricode}: ${formatPercentageWithAttempts(away.shooting.threePct, away.totals.threePointersMade, away.totals.threePointersAttempted)}.`,
      ],
    },
    {
      key: "players",
      title: "Players",
      strength: features.playerNotes.length ? 4.5 : 0,
      items: features.playerNotes.slice(0, 2),
    },
    {
      key: "lineups",
      title: "Lineups",
      strength: features.lineupNotes.length ? 3 : 0,
      items: features.lineupNotes.slice(0, 2),
    },
    {
      key: "freeThrows",
      title: "Free Throws",
      strength: Math.abs(home.totals.freeThrowsAttempted - away.totals.freeThrowsAttempted),
      items: [
        `${home.tricode} free throws: ${home.totals.freeThrowsMade}/${home.totals.freeThrowsAttempted}. ${away.tricode}: ${away.totals.freeThrowsMade}/${away.totals.freeThrowsAttempted}.`,
      ],
    },
  ];

  return signals
    .map((signal) => ({
      ...signal,
      items: signal.items.filter(Boolean),
    }))
    .filter((signal) => signal.strength > 0 && signal.items.length);
}

function leaderPointsLabel(features: ReturnType<typeof buildFeaturePayload>) {
  const info = leaderInfo(features);
  return `${info.leaderPoints}-${info.trailerPoints}`;
}

function buildEdgeText(
  home: ReturnType<typeof buildFeaturePayload>["teams"]["home"],
  away: ReturnType<typeof buildFeaturePayload>["teams"]["away"],
  homeValue: number,
  awayValue: number,
  label: string,
) {
  if (homeValue === awayValue) return null;
  const leader = homeValue > awayValue ? home : away;
  const trailer = homeValue > awayValue ? away : home;
  const leaderValue = Math.max(homeValue, awayValue);
  const trailerValue = Math.min(homeValue, awayValue);
  return `${leader.tricode} ${label} edge: ${leaderValue}-${trailerValue}.`;
}

function buildTurnoverText(home: Record<string, any>, away: Record<string, any>) {
  const homeTurnovers = safeNumber(home.totals?.turnovers, 0);
  const awayTurnovers = safeNumber(away.totals?.turnovers, 0);
  if (homeTurnovers === awayTurnovers) return null;
  const leader = homeTurnovers < awayTurnovers ? home : away;
  const trailer = homeTurnovers < awayTurnovers ? away : home;
  const leaderValue = Math.min(homeTurnovers, awayTurnovers);
  const trailerValue = Math.max(homeTurnovers, awayTurnovers);
  return `${leader.tricode} committed fewer turnovers (${leaderValue} to ${trailerValue}).`;
}

function sanitizeTurnoverLanguage(value: unknown, features: ReturnType<typeof buildFeaturePayload>) {
  const text = String(value || "").trim();
  const turnoverText = buildTurnoverText(features.teams.home, features.teams.away);
  if (!text || !turnoverText) return text;

  const turnoverClause = turnoverText.replace(/\.$/, "");
  const teamSubject = String.raw`(?:the\s+)?(?:[A-Z]{2,4}|[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})`;
  return text
    .replace(new RegExp(String.raw`\b${teamSubject}\s+forced\s+fewer\s+turnovers\s*(?:\([^)]*\))?`, "gi"), `${turnoverClause} `)
    .replace(new RegExp(String.raw`\b${teamSubject}\s+won\s+turnovers\s*[-+]?\d*(?:\s*\([^)]*\))?`, "gi"), `${turnoverClause} `)
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalizeStatAbbreviations(value: unknown) {
  let text = String(value || "").trim();
  if (!text) return text;

  const statReplacement = (rawNumber: string, singularLabel: string, pluralLabel = singularLabel) => {
    const numeric = Number(rawNumber);
    return `${rawNumber} ${numeric === 1 ? singularLabel : pluralLabel}`;
  };

  text = text
    .replace(/\b(\d+(?:\.\d+)?)\s*points?\s+created\s+from\s+assists?\b/gi, (_match: string, rawNumber: string) => `${statReplacement(rawNumber, "Pt", "Pts")} via Ast`)
    .replace(/\b(\d+(?:\.\d+)?)\s*points?\s+off\s+turnovers?\b/gi, (_match: string, rawNumber: string) => `${statReplacement(rawNumber, "Pt", "Pts")} off TO`)
    .replace(/\bpoints?\s+off\s+turnovers?\b/gi, "Pts off TO")
    .replace(/\bpaint\s+points?\b/gi, "paint Pts")
    .replace(/\btransition\s+points?\b/gi, "transition Pts")
    .replace(/\bsecond[-\s]chance\s+points?\b/gi, "second-chance Pts")
    .replace(/\boffensive\s+rebounds?\b/gi, "OReb")
    .replace(/\bdefensive\s+rebounds?\b/gi, "DReb")
    .replace(/\boffensive\s+boards?\b/gi, "OReb")
    .replace(/\bdefensive\s+boards?\b/gi, "DReb")
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:PTS?|points?)\b/gi, (_match: string, rawNumber: string) => statReplacement(rawNumber, "Pt", "Pts"))
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:AST|assists?)\b/gi, (_match: string, rawNumber: string) => statReplacement(rawNumber, "Ast"))
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:REB|rebounds?)\b/gi, (_match: string, rawNumber: string) => statReplacement(rawNumber, "Reb"))
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:STL|steals?)\b/gi, (_match: string, rawNumber: string) => statReplacement(rawNumber, "Stl"))
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:BLK|blocks?)\b/gi, (_match: string, rawNumber: string) => statReplacement(rawNumber, "Blk"))
    .replace(/\b(\d+(?:\.\d+)?)\s*turnovers?\b/gi, "$1 TO")
    .replace(/\b(\d+(?:\.\d+)?)\s*TO\b/g, "$1 TO")
    .replace(/\bturnovers?\b/gi, "TO")
    .replace(/\bassists?\b/gi, "Ast")
    .replace(/\brebounds?\b/gi, "Reb")
    .replace(/\bsteals?\b/gi, "Stl")
    .replace(/\bblocks?\b/gi, "Blk");

  return text;
}

function sanitizeAnalysisText(value: unknown, features: ReturnType<typeof buildFeaturePayload>) {
  return normalizeStatAbbreviations(sanitizeTurnoverLanguage(value, features));
}

function buildTemplateSections(features: ReturnType<typeof buildFeaturePayload>) {
  return buildInsightSignals(features)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .map((signal) => ({
      title: signal.title,
      items: signal.items.slice(0, signal.key === "gameFlow" ? 1 : 2).map((item) => sanitizeAnalysisText(item, features)),
    }));
}

function buildSwingFactors(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const factors = [
    ...(Array.isArray(features.lateSwing?.items) ? [features.lateSwing.items[0]].filter(Boolean).map((text) => ({
      label: "lateSwing",
      value: safeNumber(features.lateSwing?.strength, 0),
      text,
    })) : []),
    ...(Array.isArray(features.momentumBursts)
      ? features.momentumBursts.slice(0, 1).flatMap((burst) => (
        (Array.isArray(burst.items) ? burst.items : [])
          .slice(0, 2)
          .map((text, index) => ({
            label: `momentumBurst-${index + 1}`,
            value: safeNumber(burst.strength, 0),
            text,
          }))
      ))
      : []),
    {
      label: "turnovers",
      value: Math.abs(away.totals.turnovers - home.totals.turnovers),
      text: buildTurnoverText(home, away),
    },
    {
      label: "paint",
      value: home.totals.paintPoints - away.totals.paintPoints,
      text: buildEdgeText(home, away, home.totals.paintPoints, away.totals.paintPoints, "paint points"),
    },
    {
      label: "transition",
      value: home.totals.transitionPoints - away.totals.transitionPoints,
      text: buildEdgeText(home, away, home.totals.transitionPoints, away.totals.transitionPoints, "transition points"),
    },
    {
      label: "secondChance",
      value: home.totals.secondChancePoints - away.totals.secondChancePoints,
      text: buildEdgeText(home, away, home.totals.secondChancePoints, away.totals.secondChancePoints, "second-chance points"),
    },
    {
      label: "pointsOffTurnovers",
      value: home.totals.pointsOffTurnovers - away.totals.pointsOffTurnovers,
      text: buildEdgeText(home, away, home.totals.pointsOffTurnovers, away.totals.pointsOffTurnovers, "points off turnovers"),
    },
  ]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .filter((item) => item.value !== 0 && item.text)
    .slice(0, 3)
    .map((item) => sanitizeAnalysisText(item.text, features));

  return factors.slice(0, 4);
}

function buildStatOutliers(features: ReturnType<typeof buildFeaturePayload>) {
  const { home, away } = features.teams;
  const notes = [];

  if (features.playerNotes.length) {
    notes.push(...features.playerNotes.slice(0, 2));
  }

  notes.push(`${home.tricode} shot ${formatPercentageWithAttempts(home.shooting.fgPct, home.totals.fieldGoalsMade, home.totals.fieldGoalsAttempted)} versus ${away.tricode} at ${formatPercentageWithAttempts(away.shooting.fgPct, away.totals.fieldGoalsMade, away.totals.fieldGoalsAttempted)}.`);
  notes.push(`${home.tricode} rim scoring was ${formatPercentageWithAttempts(home.shooting.rimPct, home.totals.rimFieldGoalsMade, home.totals.rimFieldGoalsAttempted)}; ${away.tricode} was ${formatPercentageWithAttempts(away.shooting.rimPct, away.totals.rimFieldGoalsMade, away.totals.rimFieldGoalsAttempted)}.`);
  notes.push(`${home.tricode} from three: ${formatPercentageWithAttempts(home.shooting.threePct, home.totals.threePointersMade, home.totals.threePointersAttempted)}; ${away.tricode}: ${formatPercentageWithAttempts(away.shooting.threePct, away.totals.threePointersMade, away.totals.threePointersAttempted)}.`);

  if (home.totals.freeThrowsAttempted !== away.totals.freeThrowsAttempted) {
    notes.push(`${home.tricode} free throws: ${home.totals.freeThrowsMade}/${home.totals.freeThrowsAttempted}; ${away.tricode}: ${away.totals.freeThrowsMade}/${away.totals.freeThrowsAttempted}.`);
  }

  return notes.slice(0, 4).map((item) => sanitizeAnalysisText(item, features));
}

function buildTemplateAnalysis(features: ReturnType<typeof buildFeaturePayload>) {
  const { leader, trailer, margin, leaderPoints, trailerPoints } = leaderInfo(features);
  const swingFactors = buildSwingFactors(features);
  const statOutliers = buildStatOutliers(features);
  const sections = buildTemplateSections(features);
  const rangeLabel = rangeContextLabel(features);
  const dominantTitle = sections[0]?.title || "Game Flow";
  let headlineDetail = "with the stronger overall stretch";
  if (dominantTitle === "Run") headlineDetail = "behind the largest unanswered run";
  if (dominantTitle === "Late Collapse") headlineDetail = "after the late-game swing";
  if (dominantTitle === "Late Comeback") headlineDetail = "with the late comeback";
  if (dominantTitle === "Momentum Swing") headlineDetail = "behind the key momentum push";
  if (dominantTitle === "Lineups") headlineDetail = "behind the better lineup minutes";
  if (dominantTitle === "Shooting") headlineDetail = "behind the shotmaking edge";
  if (dominantTitle === "Shot Profile") headlineDetail = "behind the shot-profile edge";

  const summaryParts = [
    `${leader.tricode} outscored ${trailer.tricode} ${leaderPoints}-${trailerPoints} in ${rangeLabel} over ${features.range.duration}, moving the score from ${formatScoreState(features.score.start, features)} to ${formatScoreState(features.score.end, features)}.`,
    swingFactors[0],
    statOutliers[0],
  ].filter(Boolean);

  return {
    source: "template",
    headline: sanitizeAnalysisText(`${leader.tricode} ${margin === 0 ? "played" : "won"} ${rangeLabel} ${leaderPoints}-${trailerPoints} ${headlineDetail}.`, features),
    summary: sanitizeAnalysisText(summaryParts.join(" "), features),
    sections,
    uniformDetails: {
      swingFactors,
      lineupNotes: features.lineupNotes.map((item) => sanitizeAnalysisText(item, features)),
      statOutliers,
    },
    swingFactors,
    lineupNotes: features.lineupNotes.map((item) => sanitizeAnalysisText(item, features)),
    statOutliers,
  };
}

function buildAnalysisDataSignatureInput(features: ReturnType<typeof buildFeaturePayload>) {
  return {
    range: features.range,
    score: features.score,
    teams: features.teams,
    playerNotes: features.playerNotes,
    gameFlow: features.gameFlow,
    momentumBursts: features.momentumBursts,
    lateSwing: features.lateSwing,
    lineupNotes: features.lineupNotes,
    dataQuality: features.dataQuality,
  };
}

function attachResponseMetadata(
  analysis: Record<string, unknown>,
  templateAnalysis: ReturnType<typeof buildTemplateAnalysis>,
  features: ReturnType<typeof buildFeaturePayload>,
  extra: Record<string, unknown> = {},
) {
  return {
    ...analysis,
    uniformDetails: templateAnalysis.uniformDetails,
    rangeLabel: `${features.range.startLabel} to ${features.range.endLabel}`,
    dataWarnings: Array.isArray(features.dataQuality?.warnings) ? features.dataQuality.warnings : [],
    dataQuality: features.dataQuality,
    ...extra,
  };
}

function collectAnalysisStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectAnalysisStrings(entry));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectAnalysisStrings(entry));
  }
  return [];
}

function collectKnownShootingPercentages(features: ReturnType<typeof buildFeaturePayload>) {
  const refs: Array<{ percentageText: string; made: number; attempted: number }> = [];
  [features.teams.home, features.teams.away].forEach((team) => {
    [
      [team.shooting.fgPct, team.totals.fieldGoalsMade, team.totals.fieldGoalsAttempted],
      [team.shooting.threePct, team.totals.threePointersMade, team.totals.threePointersAttempted],
      [team.shooting.rimPct, team.totals.rimFieldGoalsMade, team.totals.rimFieldGoalsAttempted],
      [team.shooting.midPct, team.totals.midFieldGoalsMade, team.totals.midFieldGoalsAttempted],
      [team.shooting.ftPct, team.totals.freeThrowsMade, team.totals.freeThrowsAttempted],
    ].forEach(([percentageValue, made, attempted]) => {
      if (percentageValue == null || !safeNumber(attempted, 0)) return;
      refs.push({
        percentageText: formatPercentage(percentageValue),
        made: safeNumber(made, 0),
        attempted: safeNumber(attempted, 0),
      });
    });
  });
  return refs;
}

function hasBarePercentageReference(text: string, percentageText: string) {
  let index = text.indexOf(percentageText);
  while (index !== -1) {
    const previous = index > 0 ? text[index - 1] : "";
    const tail = text.slice(index + percentageText.length);
    if (!/[0-9.]/.test(previous) && !/^\s*\(/.test(tail)) return true;
    index = text.indexOf(percentageText, index + percentageText.length);
  }
  return false;
}

function hasZeroMarginLanguage(text: string) {
  return /\b(?:largest\s+)?(?:lead|advantage|deficit|gap|cushion)\s+(?:being|was|of)?\s*0\b/i.test(text)
    || /\b0[-\s]?point\s+(?:lead|advantage|deficit|gap|cushion)\b/i.test(text);
}

function hasOverstatedAllTeamScoring(text: string) {
  return /\baccount(?:ed|ing)\s+for\s+all\s+of\b.*\b(?:scoring|points)\b/i.test(text)
    || /\bscored\s+all\s+\d+\s+of\b.*\b(?:scoring|points)\b/i.test(text)
    || /\bscored\s+all\s+of\b.*\b(?:scoring|points)\b/i.test(text);
}

function isSameScorePair(first: number, second: number, expectedFirst: number, expectedSecond: number) {
  return first === expectedFirst && second === expectedSecond;
}

function isExpectedRangePointPair(first: number, second: number, features: ReturnType<typeof buildFeaturePayload>) {
  const homePoints = safeNumber(features?.score?.rangePoints?.home, 0);
  const awayPoints = safeNumber(features?.score?.rangePoints?.away, 0);
  return isSameScorePair(first, second, homePoints, awayPoints)
    || isSameScorePair(first, second, awayPoints, homePoints);
}

function isExpectedScoreTransition(
  startFirst: number,
  startSecond: number,
  endFirst: number,
  endSecond: number,
  features: ReturnType<typeof buildFeaturePayload>,
) {
  const startHome = safeNumber(features?.score?.start?.home, 0);
  const startAway = safeNumber(features?.score?.start?.away, 0);
  const endHome = safeNumber(features?.score?.end?.home, 0);
  const endAway = safeNumber(features?.score?.end?.away, 0);

  const awayHomeOrder = isSameScorePair(startFirst, startSecond, startAway, startHome)
    && isSameScorePair(endFirst, endSecond, endAway, endHome);
  const homeAwayOrder = isSameScorePair(startFirst, startSecond, startHome, startAway)
    && isSameScorePair(endFirst, endSecond, endHome, endAway);

  return awayHomeOrder || homeAwayOrder;
}

function isLikelyWholeSpanScoreClaim(context: string, first: number, second: number, features: ReturnType<typeof buildFeaturePayload>) {
  const rangeTotal = safeNumber(features?.score?.rangePoints?.home, 0) + safeNumber(features?.score?.rangePoints?.away, 0);
  const pairTotal = first + second;
  const totalLooksLikeRange = rangeTotal > 0
    && pairTotal >= Math.max(1, rangeTotal * 0.85)
    && pairTotal <= Math.max(1, rangeTotal * 1.15);
  const hasSegmentContext = /\b(?:quarter|half|period|span|stretch|game|Q[1-4]|OT|overtime|selected range)\b/i.test(context);
  const hasRunContext = /\b(?:run|burst|push|from\s+(?:Q[1-4]|OT)|to\s+(?:Q[1-4]|OT)|from\s+\d{1,2}:\d{2}|to\s+\d{1,2}:\d{2})\b/i.test(context);

  return totalLooksLikeRange || (hasSegmentContext && !hasRunContext);
}

function findInvalidSpanScoreClaims(analysis: Record<string, unknown>, features: ReturnType<typeof buildFeaturePayload>) {
  const reasons = [];
  const texts = collectAnalysisStrings({
    headline: analysis.headline,
    summary: analysis.summary,
    sections: analysis.sections,
  });

  for (const text of texts) {
    const scoreTransitionPattern = /\bscore\b[^.?!]{0,80}?\bfrom\s+(\d{1,3})\s*[-–]\s*(\d{1,3})\s+to\s+(\d{1,3})\s*[-–]\s*(\d{1,3})/gi;
    let transitionMatch: RegExpExecArray | null;
    while ((transitionMatch = scoreTransitionPattern.exec(text))) {
      const [startFirst, startSecond, endFirst, endSecond] = transitionMatch.slice(1).map((value) => safeNumber(value, -1));
      if (!isExpectedScoreTransition(startFirst, startSecond, endFirst, endSecond, features)) {
        reasons.push(`score transition ${startFirst}-${startSecond} to ${endFirst}-${endSecond} does not match ${formatScoreState(features.score.start, features)} to ${formatScoreState(features.score.end, features)}`);
      }
    }

    const spanScorePattern = /\b(?:outscored|outscoring|won|winning|took|taking|claimed|controlled|dominated|finished)\b[^.?!]{0,90}?\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/gi;
    let spanMatch: RegExpExecArray | null;
    while ((spanMatch = spanScorePattern.exec(text))) {
      const first = safeNumber(spanMatch[1], -1);
      const second = safeNumber(spanMatch[2], -1);
      if (isExpectedRangePointPair(first, second, features)) continue;

      const contextStart = Math.max(0, spanMatch.index - 100);
      const contextEnd = Math.min(text.length, spanMatch.index + spanMatch[0].length + 100);
      const context = text.slice(contextStart, contextEnd);
      if (isLikelyWholeSpanScoreClaim(context, first, second, features)) {
        reasons.push(`span score claim ${first}-${second} does not match selected range scoring ${formatRangeScoringFacts(features)}`);
      }
    }
  }

  return reasons;
}

function findAiAnalysisRejectReasons(analysis: Record<string, unknown>, features: ReturnType<typeof buildFeaturePayload>) {
  const reasons = [];
  const texts = collectAnalysisStrings({
    headline: analysis.headline,
    summary: analysis.summary,
    sections: analysis.sections,
  });
  if (texts.some(hasZeroMarginLanguage)) reasons.push("uses 0 as a lead, deficit, gap, cushion, or advantage");
  if (texts.some(hasOverstatedAllTeamScoring)) reasons.push("overstates a player's share of team scoring");

  const percentages = collectKnownShootingPercentages(features);
  percentages.forEach((reference) => {
    if (texts.some((text) => hasBarePercentageReference(text, reference.percentageText))) {
      reasons.push(`cites ${reference.percentageText} without made/attempt total`);
    }
  });

  reasons.push(...findInvalidSpanScoreClaims(analysis, features));

  return [...new Set(reasons)];
}

function shouldRejectAiAnalysis(analysis: Record<string, unknown>, features: ReturnType<typeof buildFeaturePayload>) {
  return findAiAnalysisRejectReasons(analysis, features).length > 0;
}

function sanitizeAiHeadline(headline: string, features: ReturnType<typeof buildFeaturePayload>) {
  const trimmed = String(headline || "").trim();
  if (!trimmed) return "";

  const endingMargin = Math.max(
    Math.abs(safeNumber(features?.score?.margin?.home, 0)),
    Math.abs(safeNumber(features?.score?.margin?.away, 0)),
  );
  const largestLead = Object.values(features?.gameFlow?.largestLead || {}).reduce((max, entry) => {
    const points = safeNumber((entry as { points?: number } | null)?.points, 0);
    return Math.max(max, points);
  }, 0);

  if (!largestLead || largestLead === endingMargin) return trimmed;
  if (/largest lead|peaked at|as large as|as many as/i.test(trimmed)) return trimmed;

  return trimmed.replace(/\b((?:a|an|the)\s+)?(\d+)[-\s]?point lead\b/gi, (match, article = "", rawNumber = "") => {
    const leadNumber = Number(rawNumber);
    if (!Number.isFinite(leadNumber) || leadNumber === endingMargin || leadNumber !== largestLead) return match;
    return `${article}lead that peaked at ${leadNumber}`;
  });
}

async function generateAiAnalysis(features: ReturnType<typeof buildFeaturePayload>, previousRejectReasons: string[] = []) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const exactScoreFacts = [
    `Selected range: ${features.range.startLabel} to ${features.range.endLabel} (${features.range.duration}).`,
    `Start score: ${formatScoreState(features.score.start, features)}.`,
    `End score: ${formatScoreState(features.score.end, features)}.`,
    `Selected range scoring: ${formatRangeScoringFacts(features)}.`,
    "If you describe the selected quarter, half, game, or span score, it must match the selected range scoring exactly.",
  ];
  const retryInstructions = previousRejectReasons.length
    ? [
      `Previous draft was rejected for: ${previousRejectReasons.join("; ")}.`,
      "Regenerate the analysis with those issues corrected. Do not repeat any rejected score, percentage, or margin claim.",
    ]
    : [];

  const systemPrompt = [
    "You are a basketball analyst.",
    "Use only the structured game data provided.",
    "Use player names exactly as provided in the JSON input and do not expand initials into guessed full names.",
    "Do not invent stats, possessions, or player impact claims.",
    "Do not overstate player scoring share; if a player scored 10 Pts for a team that scored 38, do not say he scored all of the team's points.",
    "When citing team edges in categories like paint Pts or Pts off TO, name the team with the higher value.",
    "For turnovers, lower is better; never say a team won turnovers because it committed more turnovers. Say the lower-turnover team committed fewer turnovers.",
    "Do not write 'forced fewer turnovers'; forced turnovers are opponent turnovers. When comparing the TO column, say committed fewer turnovers.",
    "Use stat abbreviations exactly as Pt/Pts, Ast, Reb, Stl, Blk, TO, OReb, and DReb when citing count stats.",
    "Use phrases like Pts off TO, paint Pts, transition Pts, and second-chance Pts for those team stat categories.",
    "Decide what most shaped this selected stretch instead of forcing equal attention to every category.",
    "Vary sentence structure and avoid repeating the same opening pattern from one answer to the next.",
    "If one theme clearly dominates, center the answer on that theme.",
    "When the data shows a late-game collapse, comeback, or dramatic final-minute swing, make that central to the analysis even if aggregate quarter stats point elsewhere.",
    "Use game-flow context such as lead changes, largest leads, and concentrated momentum bursts to describe how the stretch unfolded, not just who won the box-score categories.",
    "When describing multiple momentum bursts, preserve the chronological order provided in momentumBursts.items; do not describe a later run first and then call an earlier run a response.",
    "When citing a field-goal, three-point, rim, mid-range, or free-throw percentage, immediately include the made/attempt total in parentheses, for example: 47.8% (11/23).",
    "Never write a direct shooting percentage without its made/attempt total immediately after it.",
    "Never describe 0 as a lead, deficit, gap, cushion, or advantage. If a team's largest lead is 0, say that team never led or that the game was tied.",
    "When describing a run that erased, trimmed, opened, or failed to close a deficit/gap, use the provided startMargin and endMargin context to state the exact margin movement.",
    "Prefer concrete margin language like 'cut a 13-point deficit to 6' over vague phrases like 'closed the gap' or 'erased a double-digit deficit'.",
    "Do not confuse largest lead within the stretch with the score or margin at the end of the stretch.",
    "The headline follows the same rule: do not use bare 'N-point lead' wording unless N is the actual ending margin of the selected span.",
    "If you say 'by the end of the quarter', 'by the end of the span', or similar, that statement must match score.end exactly.",
    "If you mention the largest lead, label it explicitly as the largest lead or say the lead peaked there, and not the ending margin unless they are the same.",
    "If a team won the selected quarter or span by N but did not finish the full game ahead by N, describe it as winning the quarter/span by N or outscoring the opponent by N in that stretch, not as finishing ahead/up by N.",
    "Keep segment analysis anchored to full-game context when relevant: distinguish the scoring margin within the selected span from the actual game margin at the end of the game.",
    "Call out notable individual player stretches when the provided data clearly supports it, especially when one player drove a large share of a team's scoring in the selected window.",
    "Only mention lineup notes when they materially matter in the range. Lineup notes aggregate same-five groups across separate stints, so do not describe them as single stints unless the note explicitly says one stint.",
    "Return compact JSON with keys: headline, summary, sections.",
    "sections must be an array of 1 to 3 objects with keys: title and items.",
    "Use short, natural section titles. Each section should have 1 or 2 concise bullet strings.",
    ...exactScoreFacts,
    ...retryInstructions,
  ].join(" ");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: ANALYSIS_RESPONSE_SCHEMA,
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
    headline: sanitizeAnalysisText(sanitizeAiHeadline(String(parsed?.headline || "").trim(), features), features),
    summary: sanitizeAnalysisText(parsed?.summary, features),
    sections: Array.isArray(parsed?.sections)
      ? parsed.sections
        .map((section: unknown) => {
          if (!section || typeof section !== "object" || Array.isArray(section)) return null;
          const title = String((section as Record<string, unknown>).title || "").trim();
          const items = Array.isArray((section as Record<string, unknown>).items)
            ? ((section as Record<string, unknown>).items as unknown[])
              .map((item) => sanitizeAnalysisText(item, features))
              .filter(Boolean)
              .slice(0, 2)
            : [];
          if (!title || !items.length) return null;
          return { title, items };
        })
        .filter(Boolean)
        .slice(0, 3)
      : [],
    uniformDetails: null,
    swingFactors: Array.isArray(parsed?.swingFactors) ? parsed.swingFactors.map((item: unknown) => sanitizeAnalysisText(item, features)).filter(Boolean) : [],
    lineupNotes: Array.isArray(parsed?.lineupNotes) ? parsed.lineupNotes.map((item: unknown) => sanitizeAnalysisText(item, features)).filter(Boolean) : [],
    statOutliers: Array.isArray(parsed?.statOutliers) ? parsed.statOutliers.map((item: unknown) => sanitizeAnalysisText(item, features)).filter(Boolean) : [],
  };
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const operation = String(body?.operation || "").trim();
    const gameId = String(body?.gameId || "").trim();
    let game = body?.game && typeof body.game === "object" ? body.game as Record<string, unknown> : null;
    let minutesData = body?.minutesData && typeof body.minutesData === "object" ? body.minutesData as Record<string, unknown> : null;
    const range = typeof body?.range === "object" && body.range ? body.range : {};
    const cacheRequest = normalizeCacheRequest(body?.cache);

    if (!/^\d{10}$/.test(gameId)) {
      return jsonResponse(400, { error: "A valid game ID is required." });
    }

    const requesterIsAdmin = await isAdminRequest(req);

    if (operation === "list-cached-segments") {
      return jsonResponse(200, {
        segments: await listCachedSegments(gameId, requesterIsAdmin),
      });
    }

    if (!game) {
      game = await requestJson(`${API_BASE}/games/${gameId}`);
    }
    if (!minutesData) {
      minutesData = await requestJson(`${API_BASE}/games/${gameId}/minutes`).catch(() => null);
    }

    const features = buildFeaturePayload(game, minutesData, range);
    const templateAnalysis = buildTemplateAnalysis(features);
    const dataSignature = await stableDigest(buildAnalysisDataSignatureInput(features));

    if (cacheRequest) {
      const cached = await readCachedSegment(gameId, cacheRequest.segmentKey, dataSignature, requesterIsAdmin);
      if (cached) {
        return jsonResponse(200, cached);
      }
    }

    let analysis = templateAnalysis;
    let aiAttemptCount = 0;
    let aiRejectReasons: string[] = [];
    let aiError = "";
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        aiAttemptCount = attempt + 1;
        const aiAnalysis = await generateAiAnalysis(features, aiRejectReasons);
        if (!aiAnalysis) {
          aiRejectReasons = ["AI generation is unavailable or not configured"];
          break;
        }

        const rejectReasons = findAiAnalysisRejectReasons(aiAnalysis as Record<string, unknown>, features);
        if (aiAnalysis.headline && aiAnalysis.summary && !rejectReasons.length) {
          analysis = aiAnalysis;
          aiRejectReasons = [];
          break;
        }

        aiRejectReasons = rejectReasons.length ? rejectReasons : ["AI response was missing required headline or summary"];
      }
    } catch (error) {
      aiError = error instanceof Error ? error.message : "AI generation failed";
      // Keep the deterministic template response when AI is unavailable.
    }

    const usedAi = String((analysis as Record<string, unknown>).source || "") === "ai";
    const aiMetadata = {
      attempted: aiAttemptCount,
      used: usedAi,
      rejectionReasons: usedAi ? [] : aiRejectReasons,
      error: usedAi ? "" : aiError,
    };
    const fallbackReason = usedAi
      ? ""
      : aiError
        ? `AI error: ${aiError}`
        : aiRejectReasons.length
          ? `AI rejected: ${aiRejectReasons.join("; ")}`
          : "AI unavailable or not configured";

    const responsePayload: Record<string, unknown> = attachResponseMetadata(
      analysis as Record<string, unknown>,
      templateAnalysis,
      features,
      {
        cached: false,
        dataSignature,
        ai: aiMetadata,
        fallbackReason,
      },
    );

    if (cacheRequest) {
      const savedCache = await writeCachedSegment({
        gameId,
        segmentKey: cacheRequest.segmentKey,
        segmentLabel: cacheRequest.segmentLabel,
        rangeLabel: String(responsePayload.rangeLabel || ""),
        dataSignature,
        result: responsePayload,
      });
      if (savedCache) {
        responsePayload.cache = {
          segmentKey: savedCache.segment_key,
          segmentLabel: savedCache.segment_label,
          generatedAt: savedCache.generated_at,
          updatedAt: savedCache.updated_at,
          dataSignature: savedCache.data_signature,
        };
      }
    }

    return jsonResponse(200, stripAdminOnlyAnalysisMetadata(responsePayload, requesterIsAdmin));
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to generate analysis.",
    });
  }
}

export const __test__ = {
  aggregateRangeStats,
  buildFeaturePayload,
  buildInsightSignals,
  buildLateSwingInsight,
  buildTemplateAnalysis,
  formatPercentage,
  formatPercentageWithAttempts,
  findAiAnalysisRejectReasons,
  findInvalidSpanScoreClaims,
  handleRequest,
  hasOverstatedAllTeamScoring,
  hasZeroMarginLanguage,
  normalizeStatAbbreviations,
  percentage,
  sanitizeAnalysisText,
  sanitizeTurnoverLanguage,
  shouldRejectAiAnalysis,
  stripAdminOnlyAnalysisMetadata,
};

if (import.meta.main) {
  Deno.serve(handleRequest);
}
