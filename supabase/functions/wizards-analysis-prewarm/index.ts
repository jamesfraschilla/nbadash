import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const WIZARDS_TEAM_ID = "1610612764";
const CACHE_TABLE = "game_analysis_segments";
const DEFAULT_MAX_SEGMENTS_PER_RUN = 3;
const RECENT_FINAL_WINDOW_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const FUNCTION_TIMEOUT_MS = 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANALYSIS_SEGMENT_PRESETS = [
  { value: "all", label: "All Segments", minPeriod: 1, minMinutes: 12, minSeconds: 0, maxPeriod: 4, maxMinutes: 0, maxSeconds: 0 },
  { value: "q1", label: "Q1", minPeriod: 1, minMinutes: 12, minSeconds: 0, maxPeriod: 1, maxMinutes: 0, maxSeconds: 0 },
  { value: "q2", label: "Q2", minPeriod: 2, minMinutes: 12, minSeconds: 0, maxPeriod: 2, maxMinutes: 0, maxSeconds: 0 },
  { value: "q3", label: "Q3", minPeriod: 3, minMinutes: 12, minSeconds: 0, maxPeriod: 3, maxMinutes: 0, maxSeconds: 0 },
  { value: "q1-q3", label: "Q1-Q3", minPeriod: 1, minMinutes: 12, minSeconds: 0, maxPeriod: 3, maxMinutes: 0, maxSeconds: 0 },
  { value: "q4", label: "Q4", minPeriod: 4, minMinutes: 12, minSeconds: 0, maxPeriod: 4, maxMinutes: 0, maxSeconds: 0 },
  { value: "first-half", label: "1st Half", minPeriod: 1, minMinutes: 12, minSeconds: 0, maxPeriod: 2, maxMinutes: 0, maxSeconds: 0 },
  { value: "second-half", label: "2nd Half", minPeriod: 3, minMinutes: 12, minSeconds: 0, maxPeriod: 4, maxMinutes: 0, maxSeconds: 0 },
];

type JsonRecord = Record<string, unknown>;
type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

function jsonResponse(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=15",
    },
  });
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function periodLengthSeconds(period: number) {
  return period > 4 ? 5 * 60 : 12 * 60;
}

function pointToElapsedSeconds(period: number, clock: unknown) {
  let elapsed = 0;
  for (let current = 1; current < period; current += 1) {
    elapsed += periodLengthSeconds(current);
  }
  const periodLength = periodLengthSeconds(period);
  const remaining = Math.min(parseClockToSeconds(clock), periodLength);
  return elapsed + Math.max(0, periodLength - remaining);
}

function periodLabel(period: number) {
  if (period <= 4) return `Q${period}`;
  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? "OT" : `${overtimeNumber}OT`;
}

function formatClock(minutes: number, seconds: number) {
  return `${safeNumber(minutes, 0)}:${String(safeNumber(seconds, 0)).padStart(2, "0")}`;
}

function formatAnalysisPoint(period: number, clock: string, boundary: "start" | "end" = "end") {
  if (boundary === "start" && parseClockToSeconds(clock) === 0) {
    const nextPeriod = period + 1;
    return `${periodLabel(nextPeriod)} ${formatClock(nextPeriod > 4 ? 5 : 12, 0)}`;
  }
  return `${periodLabel(period)} ${clock}`;
}

function buildCurrentElapsed(game: JsonRecord, isLive: boolean) {
  if (isLive && game?.period && game?.gameClock) {
    return pointToElapsedSeconds(
      Math.max(1, safeNumber(game.period, 1)),
      normalizeClock(game.gameClock),
    );
  }
  const finalPeriod = Math.max(1, safeNumber(game?.period, 4));
  return pointToElapsedSeconds(finalPeriod, "0:00");
}

function buildAnalysisRange(segment: typeof ANALYSIS_SEGMENT_PRESETS[number]) {
  const minClock = formatClock(segment.minMinutes, segment.minSeconds);
  const maxClock = formatClock(segment.maxMinutes, segment.maxSeconds);
  return {
    minPeriod: segment.minPeriod,
    minClock,
    minLabel: formatAnalysisPoint(segment.minPeriod, minClock, "start"),
    maxPeriod: segment.maxPeriod,
    maxClock,
    maxLabel: formatAnalysisPoint(segment.maxPeriod, maxClock, "end"),
  };
}

function buildCompletedSegments(game: JsonRecord, isLive: boolean) {
  const currentElapsed = buildCurrentElapsed(game, isLive);
  const finalStatus = safeNumber(game?.gameStatus, 0) === 3;

  return ANALYSIS_SEGMENT_PRESETS
    .map((segment) => {
      const segmentEndElapsed = pointToElapsedSeconds(segment.maxPeriod, formatClock(segment.maxMinutes, segment.maxSeconds));
      if (!finalStatus && segmentEndElapsed > currentElapsed) return null;
      return {
        key: segment.value,
        label: segment.label,
        range: buildAnalysisRange(segment),
      };
    })
    .filter(Boolean) as Array<{ key: string; label: string; range: JsonRecord }>;
}

function isWashingtonTeam(team: unknown) {
  const record = (team && typeof team === "object" ? team : {}) as JsonRecord;
  const tricode = String(record.teamTricode || record.teamAbbreviation || "").trim().toUpperCase();
  const name = `${record.teamCity || ""} ${record.teamName || ""}`.toLowerCase();
  return String(record.teamId || "").trim() === WIZARDS_TEAM_ID
    || tricode === "WAS"
    || name.includes("washington")
    || name.includes("wizards");
}

function isWashingtonGame(game: unknown) {
  const record = (game && typeof game === "object" ? game : {}) as JsonRecord;
  return isWashingtonTeam(record.homeTeam) || isWashingtonTeam(record.awayTeam);
}

function parseGameTimeMs(game: JsonRecord) {
  const candidates = [
    game?.gameTimeUTC,
    game?.gameEt,
    game?.gameDateTimeUTC,
    game?.gameDate,
    game?.date,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(String(candidate));
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  return NaN;
}

function shouldProcessGame(game: JsonRecord, now = new Date()) {
  if (!isWashingtonGame(game)) return false;
  const status = safeNumber(game.gameStatus, 0);
  if (status === 2) return true;
  if (status !== 3) return false;
  const gameTimeMs = parseGameTimeMs(game);
  if (!Number.isFinite(gameTimeMs)) return false;
  const ageMs = now.getTime() - gameTimeMs;
  return ageMs >= 0 && ageMs <= RECENT_FINAL_WINDOW_MS;
}

function dateKeyInTimeZone(date: Date, timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function nearbyDateKeys(now = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  return [...new Set([-1, 0, 1].map((offset) => dateKeyInTimeZone(new Date(now.getTime() + (offset * dayMs)))))];
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requireAdminClient() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}

async function requestJson(url: string, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function fetchGamesByDate(dateKey: string) {
  const games = await requestJson(`${API_BASE}/games/byDate?date=${encodeURIComponent(dateKey)}`);
  return Array.isArray(games) ? games as JsonRecord[] : [];
}

async function fetchGame(gameId: string) {
  return await requestJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`) as JsonRecord;
}

async function fetchCandidateGameIds(body: JsonRecord, now = new Date()) {
  const explicitGameIds = (Array.isArray(body.gameIds) ? body.gameIds : [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{10}$/.test(value));
  if (explicitGameIds.length) return [...new Set(explicitGameIds)];

  const dateKeys = (Array.isArray(body.dateKeys) ? body.dateKeys : nearbyDateKeys(now))
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  const results = await Promise.allSettled(dateKeys.map(fetchGamesByDate));
  const gameIds = new Set<string>();
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value
      .filter(isWashingtonGame)
      .forEach((game) => {
        const gameId = String(game.gameId || "").trim();
        if (/^\d{10}$/.test(gameId)) gameIds.add(gameId);
      });
  });
  return [...gameIds];
}

async function listCachedSegmentKeys(admin: SupabaseAdminClient, gameId: string) {
  const { data, error } = await admin
    .from(CACHE_TABLE)
    .select("segment_key")
    .eq("game_id", gameId)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

  if (error) throw error;
  return new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => String((row as JsonRecord).segment_key || "").trim())
      .filter(Boolean),
  );
}

async function invokeGameAnalysis(gameId: string, segment: { key: string; label: string; range: JsonRecord }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase function credentials are not configured.");

  const response = await fetch(`${supabaseUrl}/functions/v1/game-analysis`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      gameId,
      range: segment.range,
      cache: {
        segmentKey: segment.key,
        segmentLabel: segment.label,
      },
    }),
    signal: AbortSignal.timeout(FUNCTION_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(String(data?.error || `game-analysis failed (${response.status})`));
  }
  return data;
}

async function prewarmGame(admin: SupabaseAdminClient, gameId: string, options: { dryRun: boolean; maxSegments: number; now: Date }) {
  const game = await fetchGame(gameId);
  if (!shouldProcessGame(game, options.now)) {
    return {
      gameId,
      processed: false,
      reason: "not-live-or-recent-final-wizards-game",
      generated: [],
      skipped: [],
      errors: [],
    };
  }

  const status = safeNumber(game.gameStatus, 0);
  const isLive = status === 2;
  const completedSegments = buildCompletedSegments(game, isLive);
  if (!completedSegments.length) {
    return {
      gameId,
      processed: true,
      reason: "no-completed-segments",
      generated: [],
      skipped: [],
      errors: [],
    };
  }

  const cachedKeys = await listCachedSegmentKeys(admin, gameId);
  const missingSegments = completedSegments.filter((segment) => !cachedKeys.has(segment.key));
  const selectedSegments = missingSegments.slice(0, options.maxSegments);
  const skipped = [
    ...completedSegments.filter((segment) => cachedKeys.has(segment.key)).map((segment) => ({
      segmentKey: segment.key,
      reason: "cached",
    })),
    ...missingSegments.slice(options.maxSegments).map((segment) => ({
      segmentKey: segment.key,
      reason: "run-limit",
    })),
  ];
  const generated: Array<{ segmentKey: string; segmentLabel: string; cached?: unknown }> = [];
  const errors: Array<{ segmentKey: string; message: string }> = [];

  for (const segment of selectedSegments) {
    if (options.dryRun) {
      generated.push({ segmentKey: segment.key, segmentLabel: segment.label, cached: "dry-run" });
      continue;
    }
    try {
      const result = await invokeGameAnalysis(gameId, segment);
      generated.push({ segmentKey: segment.key, segmentLabel: segment.label, cached: Boolean(result?.cached) });
    } catch (error) {
      errors.push({
        segmentKey: segment.key,
        message: error instanceof Error ? error.message : "Unable to prepare segment.",
      });
    }
  }

  return {
    gameId,
    processed: true,
    status,
    period: safeNumber(game.period, 0),
    gameClock: normalizeClock(game.gameClock),
    completedSegments: completedSegments.map((segment) => segment.key),
    generated,
    skipped,
    errors,
  };
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const body = await req.json().catch(() => ({})) as JsonRecord;
    const requestedNow = body.now ? new Date(String(body.now)) : new Date();
    const now = Number.isNaN(requestedNow.getTime()) ? new Date() : requestedNow;
    const admin = requireAdminClient();
    const maxSegments = Math.max(
      1,
      Math.min(8, safeNumber(body.maxSegmentsPerRun, safeNumber(Deno.env.get("WIZARDS_ANALYSIS_MAX_SEGMENTS_PER_RUN"), DEFAULT_MAX_SEGMENTS_PER_RUN))),
    );
    const gameIds = await fetchCandidateGameIds(body, now);
    const dryRun = Boolean(body.dryRun);
    const results = [];

    for (const gameId of gameIds) {
      results.push(await prewarmGame(admin, gameId, { dryRun, maxSegments, now }));
    }

    return jsonResponse(200, {
      ok: true,
      dryRun,
      checkedGameIds: gameIds,
      results,
    });
  } catch (error) {
    console.error("Unable to prewarm Wizards shared analysis.", error);
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to prewarm Wizards shared analysis.",
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export const __test__ = {
  buildCompletedSegments,
  buildAnalysisRange,
  dateKeyInTimeZone,
  isWashingtonGame,
  nearbyDateKeys,
  shouldProcessGame,
};
